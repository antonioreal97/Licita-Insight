import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailDeadlineSnapshot } from "./digest-deadlines";
import { renderNotificationEmail } from "./email-template";

describe("notification email template", () => {
  it("renders a deadline change without repeating the current deadline", () => {
    const rendered = renderNotificationEmail({
      mode: "immediate",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [
        {
          id: "notification-1",
          type: "tender_deadline_changed",
          createdAt: new Date("2026-09-24T12:00:00Z"),
          tenderId: "tender/1",
          tenderTitle: "TEST <Edital>",
          tenderOrganizationName: "Órgão & Companhia",
          tenderProposalDeadline: new Date("2026-09-25T18:00:00Z"),
          change: {
            field: "proposalDeadline",
            from: "2026-09-24T13:00:00.000Z",
            to: "2026-09-25T18:00:00.000Z",
          },
          savedSearchName: null,
          savedSearchQuery: null,
          matchCount: null,
        },
      ],
    });
    assert.match(rendered.html, /TEST &lt;Edital&gt;/);
    assert.match(rendered.html, /Órgão &amp; Companhia/);
    assert.match(
      rendered.text,
      /Prazo alterado: 24\/09\/2026, 10:00 → 25\/09\/2026, 15:00/,
    );
    assert.doesNotMatch(rendered.text, /Prazo: 25\/09\/2026/);
    assert.match(rendered.text, /\/tenders\/tender%2F1/);
    assert.doesNotMatch(rendered.html, /<img/i);
    assert.equal(
      rendered.headers["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
    assert.match(rendered.headers["List-Unsubscribe"] ?? "", /scope=all/);
  });

  it("uses singular and plural without parenthesized suffixes", () => {
    const notification = {
      id: "saved-search-1",
      type: "saved_search_new_matches",
      createdAt: new Date("2026-09-24T12:00:00Z"),
      tenderId: null,
      tenderTitle: null,
      tenderOrganizationName: null,
      tenderProposalDeadline: null,
      change: null,
      savedSearchName: "Software",
      savedSearchQuery: "q=software",
      matchCount: 1,
    };
    const singular = renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [notification],
    });
    assert.equal(singular.subject, "LicitAI: 1 atualização no seu resumo");
    assert.match(singular.text, /1 novo resultado/);

    const plural = renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [
        { ...notification, id: "saved-search-2", matchCount: 4 },
        { ...notification, id: "saved-search-3" },
        { ...notification, id: "saved-search-4" },
      ],
    });
    assert.equal(plural.subject, "LicitAI: 3 atualizações no seu resumo");
    assert.match(plural.text, /4 novos resultados/);
    assert.doesNotMatch(plural.text, /\(s\)/);
  });

  it("shows only the new deadline when the previous value is unavailable", () => {
    const rendered = renderNotificationEmail({
      mode: "immediate",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [
        {
          id: "notification-without-old-deadline",
          type: "tender_deadline_changed",
          createdAt: new Date("2026-09-24T12:00:00Z"),
          tenderId: "tender-1",
          tenderTitle: "TEST DATA edital",
          tenderOrganizationName: "Órgão de teste",
          tenderProposalDeadline: new Date("2026-10-02T13:00:00Z"),
          change: {
            field: "proposalDeadline",
            from: null,
            to: "2026-10-02T13:00:00.000Z",
          },
          savedSearchName: null,
          savedSearchQuery: null,
          matchCount: null,
        },
      ],
    });
    assert.match(rendered.text, /Novo prazo: 02\/10\/2026, 10:00/);
    assert.doesNotMatch(rendered.text, /Prazo alterado:/);
    assert.match(
      rendered.text,
      /Você recebe este aviso porque monitora este edital e os avisos imediatos estão ligados\./,
    );
  });

  it("includes profile-fit highlights in the existing daily digest", () => {
    const rendered = renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [
        {
          id: "profile-fit-1",
          type: "profile_new_matches",
          createdAt: new Date("2026-09-24T12:00:00Z"),
          tenderId: null,
          tenderTitle: null,
          tenderOrganizationName: null,
          tenderProposalDeadline: null,
          change: null,
          savedSearchName: null,
          savedSearchQuery: null,
          matchCount: 2,
          profileMatches: [
            {
              id: "tender/fit",
              title: "Aquisição de servidores",
              organizationName: "Órgão de teste",
              proposalDeadline: null,
              level: "high",
            },
          ],
        },
      ],
    });
    assert.match(rendered.text, /2 novos editais com alta aderência/);
    assert.match(rendered.html, /Aquisição de servidores/);
    assert.match(rendered.html, /tender%2Ffit/);
  });
});

describe("daily digest deadlines section", () => {
  // 07:00 in Brasília.
  const now = new Date("2026-09-29T10:00:00.000Z");
  const deadline = (
    overrides: Partial<EmailDeadlineSnapshot> = {},
  ): EmailDeadlineSnapshot => ({
    tenderId: "tender/1",
    tenderTitle: "TEST DATA edital de computadores",
    tenderOrganizationName: "Órgão de teste",
    stage: "analyzing",
    kind: "personal",
    deadline: new Date("2026-10-01T15:00:00.000Z"),
    nextAction: "Enviar certidões",
    ...overrides,
  });
  const notification = {
    id: "saved-search-1",
    type: "saved_search_new_matches",
    createdAt: new Date("2026-09-28T12:00:00Z"),
    tenderId: null,
    tenderTitle: null,
    tenderOrganizationName: null,
    tenderProposalDeadline: null,
    change: null,
    savedSearchName: "Software",
    savedSearchQuery: "q=software",
    matchCount: 2,
  };
  const render = (
    deadlines: EmailDeadlineSnapshot[],
    notifications: (typeof notification)[] = [],
  ) =>
    renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications,
      deadlines,
      now,
    });

  it("renders the deadlines before the updates", () => {
    const rendered = render(
      [
        deadline(),
        deadline({
          tenderId: "tender-2",
          stage: "participating",
          kind: "proposal",
          deadline: new Date("2026-09-30T13:00:00.000Z"),
          nextAction: null,
        }),
      ],
      [notification],
    );
    assert.equal(rendered.subject, "LicitAI: 2 prazos e 1 atualização no seu resumo");
    assert.match(rendered.html, /<h3[^>]*>Seus prazos<\/h3>/);
    assert.match(rendered.html, /<h3[^>]*>Novidades<\/h3>/);
    assert.ok(rendered.html.indexOf("Seus prazos") < rendered.html.indexOf("Novidades"));
    assert.ok(rendered.text.indexOf("Seus prazos") < rendered.text.indexOf("Busca salva: Software"));
    // Closest deadline first.
    assert.ok(rendered.text.indexOf("tender-2") < rendered.text.indexOf("tender%2F1"));
    assert.match(
      rendered.text,
      /Seu prazo \(informado por você\): Enviar certidões — 01\/10\/2026, 12:00 \(em 2 dias\)/,
    );
    assert.match(rendered.text, /Prazo oficial de proposta: 30\/09\/2026, 10:00 \(amanhã\)/);
    assert.match(rendered.text, /Sua etapa: Analisando/);
    assert.match(rendered.text, /Sua etapa: Preparando documentos/);
    assert.match(rendered.text, /https:\/\/licitai\.example\/tenders\/tender%2F1/);
    assert.match(rendered.text, /a etapa é sua, não o status oficial do edital/);
    assert.equal(rendered.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  });

  it("sends only the deadlines when there are no updates", () => {
    const rendered = render([deadline()]);
    assert.equal(rendered.subject, "LicitAI: 1 prazo nos próximos dias");
    assert.match(rendered.html, /Seus prazos/);
    assert.doesNotMatch(rendered.html, /Novidades/);
  });

  it("omits the section without deadlines", () => {
    const rendered = render([], [notification]);
    assert.equal(rendered.subject, "LicitAI: 1 atualização no seu resumo");
    assert.doesNotMatch(rendered.html, /Seus prazos|Novidades/);
    assert.doesNotMatch(rendered.text, /Seus prazos|Novidades/);
  });

  it("labels today and tomorrow by the Brasília day, across the UTC turn", () => {
    const rendered = render([
      deadline({ tenderId: "late-today", deadline: new Date("2026-09-30T02:30:00.000Z") }),
      deadline({ tenderId: "early-tomorrow", deadline: new Date("2026-09-30T03:30:00.000Z") }),
    ]);
    assert.match(rendered.text, /29\/09\/2026, 23:30 \(hoje\)/);
    assert.match(rendered.text, /30\/09\/2026, 00:30 \(amanhã\)/);
  });

  it("shows at most 10 deadlines and counts the rest", () => {
    const deadlines = Array.from({ length: 13 }, (_, index) =>
      deadline({
        tenderId: `tender-${String(index).padStart(2, "0")}`,
        deadline: new Date(Date.UTC(2026, 8, 30, 12, index)),
      }),
    );
    const rendered = render(deadlines.reverse());
    assert.equal(rendered.subject, "LicitAI: 13 prazos nos próximos dias");
    assert.equal(rendered.html.match(/Ver edital/g)?.length, 10);
    assert.match(rendered.text, /tender-09/);
    assert.doesNotMatch(rendered.text, /tender-1[0-2]/);
    assert.match(rendered.text, /e mais 3 prazos nos seus editais salvos: https:\/\/licitai\.example\/saved-tenders/);
    assert.match(rendered.html, /e mais 3 prazos/);
    assert.doesNotMatch(render(deadlines.slice(0, 10)).text, /e mais/);
    assert.match(render(deadlines.slice(0, 11)).text, /e mais 1 prazo nos/);
  });

  it("escapes the text informed by the user", () => {
    const rendered = render([
      deadline({
        nextAction: '<script>alert("x")</script> & "certidões"',
        tenderTitle: "Edital <b>TEST</b>",
        tenderOrganizationName: "Órgão & Cia",
      }),
    ]);
    assert.doesNotMatch(rendered.html, /<script>|<b>TEST/);
    assert.match(rendered.html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &quot;certidões&quot;/);
    assert.match(rendered.html, /Edital &lt;b&gt;TEST&lt;\/b&gt;/);
    assert.match(rendered.html, /Órgão &amp; Cia/);
  });

  it("ignores deadlines in immediate alerts", () => {
    const rendered = renderNotificationEmail({
      mode: "immediate",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [notification],
      deadlines: [deadline()],
      now,
    });
    assert.doesNotMatch(rendered.html, /Seus prazos/);
  });
});
