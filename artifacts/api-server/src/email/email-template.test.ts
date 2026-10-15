import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EmailDeadlineSnapshot } from "./digest-deadlines";
import {
  groupSavedSearchNotifications,
  renderNotificationEmail,
  savedSearchHref,
  type EmailNotificationSnapshot,
} from "./email-template";

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
    // The only image is the static logo, with the same URL for every recipient (no tracking pixel).
    assert.equal(rendered.html.match(/<img/gi)?.length, 1);
    assert.match(
      rendered.html,
      /<img src="https:\/\/licitai\.example\/brand\/email\/pardal-logo-lima-2x\.png" width="160" height="136" alt="Pardal Digital" style="display:block;/,
    );
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
    assert.equal(singular.subject, "Pardal Digital: 1 atualização no seu resumo");
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
    assert.equal(plural.subject, "Pardal Digital: 3 atualizações no seu resumo");
    assert.match(plural.text, /4 novos resultados/);
    assert.doesNotMatch(plural.text, /\(s\)/);
  });

  it("links a saved-search alert to its immutable notification snapshot", () => {
    assert.equal(
      savedSearchHref("q=limpeza&state=DF"),
      "/search?q=limpeza&state=DF&status=all",
    );
    assert.equal(
      savedSearchHref("?q=limpeza&status=open&status=suspended"),
      "/search?q=limpeza&status=open&status=suspended",
    );
    // An empty saved query also means every status.
    assert.equal(savedSearchHref(""), "/search?status=all");

    const rendered = renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications: [
        {
          id: "saved-search-link",
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
        },
      ],
    });
    assert.match(
      rendered.text,
      /https:\/\/licitai\.example\/search\?status=all&notification=saved-search-link/,
    );
    assert.doesNotMatch(rendered.text, /newOnly/);
  });

  it("groups the digest's saved-search notifications into one card per saved search", () => {
    const row = (id: string, savedSearchId: string, hour: number, matchCount: number) => ({
      id,
      type: "saved_search_new_matches",
      createdAt: new Date(`2026-10-13T${String(hour).padStart(2, "0")}:00:00Z`),
      tenderId: null,
      tenderTitle: null,
      tenderOrganizationName: null,
      tenderProposalDeadline: null,
      change: null,
      savedSearchId,
      savedSearchName: savedSearchId === "limpeza" ? "limpeza" : "Software",
      savedSearchQuery: savedSearchId === "limpeza" ? "q=limpeza" : "q=software",
      matchCount,
    });
    const document = {
      ...row("document", "", 9, 0),
      type: "tender_document_added",
      savedSearchId: null,
      savedSearchName: null,
      savedSearchQuery: null,
      matchCount: null,
      tenderId: "tender-1",
      tenderTitle: "Edital monitorado",
    };
    // Old rows: one per 15-minute cycle, before the daily notification.
    const notifications = [
      row("limpeza-1", "limpeza", 10, 140),
      row("software-1", "software", 11, 3),
      document,
      row("limpeza-2", "limpeza", 12, 77),
      row("limpeza-3", "limpeza", 13, 1),
      row("software-2", "software", 14, 2),
    ];
    assert.deepEqual(
      groupSavedSearchNotifications(notifications).map(({ id, matchCount, groupedCount }) => ({
        id,
        matchCount,
        groupedCount,
      })),
      [
        { id: "limpeza-3", matchCount: 218, groupedCount: 3 },
        { id: "software-2", matchCount: 5, groupedCount: 2 },
        { id: "document", matchCount: null, groupedCount: undefined },
      ],
    );

    const rendered = renderNotificationEmail({
      mode: "digest",
      origin: "https://licitai.example",
      unsubscribeToken: "signed-token",
      notifications,
      deadlines: [],
    });
    assert.equal(rendered.subject, "Pardal Digital: 3 atualizações no seu resumo");
    assert.equal(rendered.text.match(/Busca salva: limpeza/g)?.length, 1);
    assert.match(rendered.text, /218 novos resultados/);
    assert.match(
      rendered.text,
      /Últimos resultados: https:\/\/licitai\.example\/search\?status=all&notification=limpeza-3/,
    );
    assert.match(
      rendered.text,
      /Abrir a busca salva: https:\/\/licitai\.example\/search\?q=limpeza&status=all/,
    );
    assert.doesNotMatch(rendered.text, /notification=limpeza-1/);
    assert.equal(rendered.html.match(/>Busca salva</g)?.length, 2);
    assert.match(rendered.html, /Abrir a busca salva/);
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
    assert.match(rendered.text, /^https:\/\/licitai\.example\/search\?status=all&notification=profile-fit-1$/m);
    assert.match(rendered.html, /<a href="https:\/\/licitai\.example\/search\?status=all&amp;notification=profile-fit-1"[^>]*>Ver oportunidades<\/a>/);
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
    nextAction: "Enviar certidões",
    personalDeadline: new Date("2026-10-01T15:00:00.000Z"),
    proposalDeadline: null,
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
          nextAction: null,
          personalDeadline: null,
          proposalDeadline: new Date("2026-09-30T13:00:00.000Z"),
        }),
      ],
      [notification],
    );
    assert.equal(rendered.subject, "Pardal Digital: 2 prazos e 1 atualização no seu resumo");
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
    assert.equal(rendered.subject, "Pardal Digital: 1 prazo nos próximos dias");
    assert.match(rendered.html, /Seus prazos/);
    assert.doesNotMatch(rendered.html, /Novidades/);
    assert.equal(rendered.html.match(/Ver edital/g)?.length, 1);
    assert.doesNotMatch(rendered.text, /Prazo oficial de proposta| · /);
  });

  it("shows a tender with both deadlines in one line, the closest first", () => {
    const proposalFirst = render([
      deadline({ proposalDeadline: new Date("2026-09-30T13:00:00.000Z") }),
    ]);
    assert.equal(proposalFirst.subject, "Pardal Digital: 2 prazos nos próximos dias");
    assert.equal(proposalFirst.html.match(/Ver edital/g)?.length, 1);
    assert.match(
      proposalFirst.text,
      /^Prazo oficial de proposta: 30\/09\/2026, 10:00 \(amanhã\) · Seu prazo \(informado por você\): Enviar certidões — 01\/10\/2026, 12:00 \(em 2 dias\)$/m,
    );
    assert.equal(proposalFirst.text.match(/Sua etapa/g)?.length, 1);

    const personalFirst = render([
      deadline({ proposalDeadline: new Date("2026-10-02T17:00:00.000Z") }),
    ]);
    assert.match(
      personalFirst.html,
      /Seu prazo \(informado por você\): Enviar certidões — 01\/10\/2026, 12:00 \(em 2 dias\) · Prazo oficial de proposta: 02\/10\/2026, 14:00 \(em 3 dias\)<\/p>/,
    );
  });

  it("orders tenders by their closest deadline", () => {
    const rendered = render([
      deadline({ tenderId: "tender-late", personalDeadline: new Date("2026-10-02T12:00:00.000Z") }),
      deadline({
        tenderId: "tender-soon",
        personalDeadline: new Date("2026-10-02T13:00:00.000Z"),
        proposalDeadline: new Date("2026-09-30T13:00:00.000Z"),
      }),
    ]);
    assert.ok(rendered.text.indexOf("tender-soon") < rendered.text.indexOf("tender-late"));
  });

  it("omits the section without deadlines", () => {
    const rendered = render([], [notification]);
    assert.equal(rendered.subject, "Pardal Digital: 1 atualização no seu resumo");
    assert.doesNotMatch(rendered.html, /Seus prazos|Novidades/);
    assert.doesNotMatch(rendered.text, /Seus prazos|Novidades/);
  });

  it("labels today and tomorrow by the Brasília day, across the UTC turn", () => {
    const rendered = render([
      deadline({ tenderId: "late-today", personalDeadline: new Date("2026-09-30T02:30:00.000Z") }),
      deadline({ tenderId: "early-tomorrow", personalDeadline: new Date("2026-09-30T03:30:00.000Z") }),
    ]);
    assert.match(rendered.text, /29\/09\/2026, 23:30 \(hoje\)/);
    assert.match(rendered.text, /30\/09\/2026, 00:30 \(amanhã\)/);
  });

  it("shows at most 10 tenders and counts the remaining tenders", () => {
    const deadlines = Array.from({ length: 13 }, (_, index) =>
      deadline({
        tenderId: `tender-${String(index).padStart(2, "0")}`,
        personalDeadline: new Date(Date.UTC(2026, 8, 30, 12, index)),
        proposalDeadline: new Date(Date.UTC(2026, 9, 1, 12, index)),
      }),
    );
    const rendered = render(deadlines.reverse());
    assert.equal(rendered.subject, "Pardal Digital: 26 prazos nos próximos dias");
    assert.equal(rendered.html.match(/Ver edital/g)?.length, 10);
    assert.match(rendered.text, /tender-09/);
    assert.doesNotMatch(rendered.text, /tender-1[0-2]/);
    assert.match(
      rendered.text,
      /e mais 3 editais salvos com prazo nos próximos dias: https:\/\/licitai\.example\/saved-tenders/,
    );
    assert.match(rendered.html, /e mais 3 editais salvos com prazo/);
    assert.doesNotMatch(render(deadlines.slice(0, 10)).text, /e mais/);
    assert.match(render(deadlines.slice(0, 11)).text, /e mais 1 edital salvo com prazo nos/);
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

describe("notification email highlights", () => {
  const origin = "https://licitai.example";
  const savedSearch = {
    id: "notification-highlights",
    type: "saved_search_new_matches",
    createdAt: new Date("2026-10-14T09:00:00Z"),
    tenderId: null,
    tenderTitle: null,
    tenderOrganizationName: null,
    tenderProposalDeadline: null,
    change: null,
    savedSearchId: "search-1",
    savedSearchName: "Limpeza predial",
    savedSearchQuery: "?q=limpeza",
    matchCount: 6,
    tenderIds: ["t-1", "t-2", "t-3", "t-4", "t-5"],
  };
  const highlight = (tenderId: string, lines: string[]) => ({
    tenderId,
    title: `Edital ${tenderId} <limpeza>`,
    organizationName: "Prefeitura & Cia",
    lines,
  });
  const render = (highlights?: Map<string, ReturnType<typeof highlight>>, notifications: EmailNotificationSnapshot[] = [savedSearch]) =>
    renderNotificationEmail({
      mode: "digest",
      origin,
      unsubscribeToken: "signed-token",
      notifications,
      highlights,
      now: new Date("2026-10-14T10:00:00Z"),
    });

  it("keeps the saved-search card as it was without highlights", () => {
    const without = render();
    const empty = render(new Map([["t-1", highlight("t-1", [])]]));
    assert.doesNotMatch(without.html, /Destaque/);
    assert.doesNotMatch(without.text, /Destaques:/);
    assert.equal(empty.html, without.html);
    assert.equal(empty.text, without.text);
  });

  it("cites up to three tenders of the saved search with their highlights, in snapshot order", () => {
    const rendered = render(
      new Map([
        ["t-5", highlight("t-5", ["Exige garantia de proposta"])],
        ["t-2", highlight("t-2", ["Alta aderência ao seu perfil: combina com “limpeza”", "Cota reservada para ME/EPP"])],
        ["t-3", highlight("t-3", ["Disputa em BLL Compras: você ainda não é cadastrado nesta plataforma"])],
        ["t-4", highlight("t-4", ["Visita técnica obrigatória"])],
      ]),
    );
    assert.match(rendered.html, /Destaques/);
    assert.match(rendered.html, /Edital t-2 &lt;limpeza&gt;/);
    assert.match(rendered.html, /Prefeitura &amp; Cia/);
    assert.match(rendered.html, /&#8226;&nbsp;Alta aderência ao seu perfil: combina com “limpeza”<br>&#8226;&nbsp;Cota reservada para ME\/EPP/);
    assert.match(rendered.html, new RegExp(`href="${origin}/tenders/t-2"`));
    assert.doesNotMatch(rendered.html, /t-5/);
    const order = ["t-2", "t-3", "t-4"].map((id) => rendered.text.indexOf(`Edital ${id}`));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(order.every((index) => index > 0));
    assert.match(rendered.text, /Destaques:\n- Edital t-2 <limpeza>\n {2}• Alta aderência ao seu perfil: combina com “limpeza”\n {2}• Cota reservada para ME\/EPP\n {2}https:\/\/licitai\.example\/tenders\/t-2/);
    // The card still links to the search results; the subject does not change.
    assert.match(rendered.html, /notification=notification-highlights/);
    assert.equal(rendered.subject, render().subject);
  });

  it("keeps one card per saved search and cites tenders from every grouped row", () => {
    const rendered = render(new Map([["t-9", highlight("t-9", ["Exige amostra ou prova de conceito"])]]), [
      { ...savedSearch, id: "older", tenderIds: ["t-9"], createdAt: new Date("2026-10-13T09:00:00Z") },
      { ...savedSearch, id: "newer", tenderIds: ["t-1"] },
    ]);
    assert.equal(rendered.html.match(/>Busca salva</g)?.length, 1);
    assert.match(rendered.html, /Exige amostra ou prova de conceito/);
  });

  it("explains each high-fit tender of a profile alert", () => {
    const profile: EmailNotificationSnapshot = {
      ...savedSearch,
      id: "profile",
      type: "profile_new_matches",
      savedSearchId: null,
      savedSearchName: null,
      savedSearchQuery: null,
      tenderIds: undefined,
      matchCount: 2,
      profileMatches: [
        { id: "t-1", title: "Limpeza do hospital", organizationName: "Hospital", proposalDeadline: null, level: "high" },
        { id: "t-2", title: "Limpeza da escola", organizationName: "Escola", proposalDeadline: null, level: "high" },
      ],
    };
    const without = render(undefined, [profile]);
    const rendered = render(new Map([["t-1", highlight("t-1", ["Exige atestado de capacidade técnica"])]]), [profile]);
    assert.doesNotMatch(without.html, /&#8226;/);
    assert.match(rendered.html, /Limpeza do hospital<\/a><br><span[^>]*>Hospital<\/span><br><span[^>]*>&#8226;&nbsp;Exige atestado de capacidade técnica/);
    assert.match(rendered.text, /Destaque: Limpeza do hospital\n {2}• Exige atestado de capacidade técnica/);
  });
});
