import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderNotificationEmail } from "./email-template";

describe("notification email template", () => {
  it("renders escaped PT-BR HTML, plain text, and one-click unsubscribe headers", () => {
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
            from: null,
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
    assert.match(rendered.text, /Novo prazo:/);
    assert.match(rendered.text, /\/tenders\/tender%2F1/);
    assert.doesNotMatch(rendered.html, /<img/i);
    assert.equal(
      rendered.headers["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
    assert.match(rendered.headers["List-Unsubscribe"] ?? "", /scope=all/);
  });
});
