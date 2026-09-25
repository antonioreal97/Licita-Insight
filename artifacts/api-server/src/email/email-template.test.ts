import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
