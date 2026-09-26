import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { and, eq } from "drizzle-orm";

const TEST_DATABASE_URL = process.env.PNCP_TEST_DATABASE_URL;

function fixturePdf(text: string): Uint8Array {
  const escaped = text.replace(/([\\()])/g, "\\$1");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

const responseFor = (url: string, text: string): Response => {
  const response = new Response(fixturePdf(text), {
    status: 200,
    headers: { "content-type": "application/pdf" },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
};

test(
  "partial index publishes, GET waits, failed re-download preserves text, and recovery bumps version",
  { skip: !TEST_DATABASE_URL, timeout: 30_000 },
  async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.AI_DOCUMENT_HOSTS = "pncp.gov.br";
    process.env.AI_DOCUMENT_RETRY_MAX_ATTEMPTS = "6";
    const {
      db,
      pool,
      tenderAiDocumentsTable,
      tenderAiIndexesTable,
      tenderAiPassagesTable,
      tendersTable,
    } = await import("@workspace/db");
    const { ensureTenderIndex, runDocumentRetryBatch } =
      await import("./tender-index-service");
    const tenderId = `codex-016-${randomUUID()}`;
    const readyUrl = "https://pncp.gov.br/test-ready.pdf";
    const retryUrl = "https://pncp.gov.br/test-retry.pdf";
    const originalFetch = globalThis.fetch;
    let phase: "initial" | "preserve" | "recover" = "initial";
    let fetchCalls = 0;
    globalThis.fetch = async (input) => {
      fetchCalls += 1;
      const url = String(input);
      if (
        (phase === "initial" && url === retryUrl) ||
        (phase === "preserve" && url === readyUrl)
      ) {
        throw new DOMException("timed out", "TimeoutError");
      }
      return responseFor(
        url,
        url === readyUrl
          ? "Prazo de entrega de dez dias corridos apos a assinatura."
          : "Garantia contratual obrigatoria de cinco por cento do valor.",
      );
    };

    try {
      await db.insert(tendersTable).values({
        id: tenderId,
        pncpControlNumber: tenderId,
        title: "Edital de teste do índice parcial",
        organizationId: "test-org",
        organizationName: "Órgão de teste",
        modality: "test",
        modalityLabel: "Teste",
        status: "open",
        estimatedValueStatus: "unknown",
        sourceId: tenderId,
        sourceName: "PNCP",
        categories: [],
        items: [],
        documents: [
          {
            id: "ready-source",
            name: "ready.pdf",
            type: "application/pdf",
            sizeBytes: null,
            url: readyUrl,
            publishedAt: null,
          },
          {
            id: "retry-source",
            name: "retry.pdf",
            type: "application/pdf",
            sizeBytes: null,
            url: retryUrl,
            publishedAt: null,
          },
        ],
        timeline: [],
        searchText: "edital teste",
        titleNorm: "edital teste",
        objectNorm: "",
        itemsNorm: "",
        organizationNorm: "orgao teste",
        otherNorm: "",
        rawPayload: {},
        fetchedAt: new Date(),
      });

      assert.equal(await ensureTenderIndex(tenderId, true), "processing");
      let status = await ensureTenderIndex(tenderId, false);
      for (
        let attempt = 0;
        status === "processing" && attempt < 200;
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        status = await ensureTenderIndex(tenderId, false);
      }
      assert.equal(status, "ready");
      assert.equal(fetchCalls, 2);

      const initialDocuments = await db
        .select()
        .from(tenderAiDocumentsTable)
        .where(eq(tenderAiDocumentsTable.tenderId, tenderId));
      assert.equal(
        initialDocuments.filter(
          ({ status: documentStatus }) => documentStatus === "ready",
        ).length,
        1,
      );
      const failed = initialDocuments.find(
        ({ status: documentStatus }) => documentStatus === "failed",
      );
      assert.ok(failed?.nextRetryAt);
      assert.equal(failed?.attemptCount, 1);

      assert.equal(await ensureTenderIndex(tenderId, true), "ready");
      assert.equal(fetchCalls, 2, "GET must not retry a waiting document");

      const ready = initialDocuments.find(
        ({ status: documentStatus }) => documentStatus === "ready",
      )!;
      await db
        .update(tenderAiDocumentsTable)
        .set({
          attemptCount: 1,
          retryable: true,
          nextRetryAt: new Date(Date.now() - 1_000),
        })
        .where(eq(tenderAiDocumentsTable.id, ready.id));
      phase = "preserve";
      assert.deepEqual(await runDocumentRetryBatch(), {
        attempted: 1,
        recovered: 0,
      });
      const [preserved] = await db
        .select()
        .from(tenderAiDocumentsTable)
        .where(eq(tenderAiDocumentsTable.id, ready.id));
      assert.equal(preserved?.status, "ready");
      assert.equal(preserved?.attemptCount, 2);
      const [indexBeforeRecovery] = await db
        .select()
        .from(tenderAiIndexesTable)
        .where(eq(tenderAiIndexesTable.tenderId, tenderId));
      assert.equal(indexBeforeRecovery?.version, 1);
      assert.ok(
        (
          await db
            .select()
            .from(tenderAiPassagesTable)
            .where(
              and(
                eq(tenderAiPassagesTable.documentId, ready.id),
                eq(tenderAiPassagesTable.indexVersion, 1),
              ),
            )
        ).length > 0,
      );

      await db
        .update(tenderAiDocumentsTable)
        .set({ nextRetryAt: new Date(Date.now() + 60_000) })
        .where(eq(tenderAiDocumentsTable.id, ready.id));
      await db
        .update(tenderAiDocumentsTable)
        .set({
          retryable: true,
          nextRetryAt: new Date(Date.now() - 1_000),
        })
        .where(eq(tenderAiDocumentsTable.id, failed!.id));
      phase = "recover";
      assert.deepEqual(await runDocumentRetryBatch(), {
        attempted: 1,
        recovered: 1,
      });
      const [recoveredIndex] = await db
        .select()
        .from(tenderAiIndexesTable)
        .where(eq(tenderAiIndexesTable.tenderId, tenderId));
      assert.equal(recoveredIndex?.status, "ready");
      assert.equal(recoveredIndex?.version, 2);
      const currentPassages = await db
        .select()
        .from(tenderAiPassagesTable)
        .where(
          and(
            eq(tenderAiPassagesTable.tenderId, tenderId),
            eq(tenderAiPassagesTable.indexVersion, 2),
          ),
        );
      assert.equal(
        new Set(currentPassages.map(({ documentId }) => documentId)).size,
        2,
      );
    } finally {
      globalThis.fetch = originalFetch;
      await db.delete(tendersTable).where(eq(tendersTable.id, tenderId));
      await pool.end();
    }
  },
);
