// Local review only: serves the real opportunity search over a test database (filled by a real BID collection)
// behind a simulated session and subscription, so the screens can be captured without Google login or Asaas.
// Run from artifacts/api-server: DATABASE_URL=… npx tsx ../../docs/reviews/idb-procurement/review-server.ts
import http from "node:http";
import { parseOpportunityQuery } from "../../../artifacts/api-server/src/lib/opportunity-query";
import {
  findOpportunity,
  searchOpportunities,
} from "../../../artifacts/api-server/src/repositories/postgres-opportunity-repository";

const port = Number(process.env.REVIEW_PORT ?? 3001);

const json = (response: http.ServerResponse, body: unknown, status = 200) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
};

const query = (url: URL): Record<string, string | string[]> => {
  const params: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    params[key] = values.length === 1 ? values[0]! : values;
  }
  return params;
};

http
  .createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    try {
      if (url.pathname === "/api/v1/auth/session")
        return json(response, {
          user: {
            id: "review-user",
            email: "review@example.invalid",
            name: "Revisão",
            avatarUrl: null,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        });
      if (url.pathname === "/api/v1/me/billing")
        return json(response, {
          status: "active",
          entitled: true,
          currentPeriodEnd: "2027-01-01T00:00:00.000Z",
          canCancel: false,
          monthlyBrl: 29,
          source: "subscription",
        });
      if (url.pathname === "/api/v1/me/notifications/unread-count")
        return json(response, { unreadCount: 0 });
      if (url.pathname === "/api/v1/opportunities")
        return json(
          response,
          await searchOpportunities(parseOpportunityQuery(query(url))),
        );
      const detail = /^\/api\/v1\/opportunities\/([^/]+)$/.exec(url.pathname);
      if (detail) {
        const opportunity = await findOpportunity(
          decodeURIComponent(detail[1]!),
        );
        return opportunity
          ? json(response, opportunity)
          : json(response, { code: "NOT_FOUND", message: "not found" }, 404);
      }
      return json(response, { code: "NOT_FOUND", message: url.pathname }, 404);
    } catch (error) {
      console.error(error);
      return json(
        response,
        { code: "REVIEW_SERVER_ERROR", message: String(error) },
        500,
      );
    }
  })
  .listen(port, () => console.log(`review server on :${port}`));
