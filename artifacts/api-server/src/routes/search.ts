import { Router, type IRouter } from "express";
import {
  GetSearchSuggestionsResponse,
  GetTenderByIdResponse,
  SearchTendersResponse,
} from "@workspace/api-zod";
import {
  ApiError,
  NotFoundError,
  UnauthenticatedError,
} from "../lib/api-error";
import { logger } from "../lib/logger";
import { parseSearchQuery, parseSuggestionsQuery } from "../lib/query-parser";
import { getSearchBackend } from "../services/search-backend";
import { publicHttpCache } from "../middlewares/request-protection";
import { scheduleTitleRewrites } from "../titles/title-rewrite";
import { scheduleTenderDetailEnrichment } from "../ingest/schedule-tender-detail-enrichment";
import { pgErrorCode } from "../lib/pg-error";
import { authContext } from "../auth/http";
import { getCompanyProfile } from "../ai/company-fit-service";
import { notificationSearchScope } from "../account/notification-service";
import { db, workspaceProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { FeatureDisabledError, InvalidParameterError, WorkspaceNotFoundError } from "../lib/api-error";
import { assertWorkspaceRouteEnabled } from "../workspaces/workspace-route-gate";
import { isWorkspaceId, requireWorkspaceMember } from "../workspaces/workspace-service";
import { ProcurementProfileSchema } from "@workspace/api-zod/hub";

const router: IRouter = Router();

const exposeSearchError = (error: unknown): unknown => {
  if (error instanceof ApiError) return error;
  logger.error({ err: error }, "Search failed");
  const code = pgErrorCode(error);
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "57P01" ||
    code === "28P01" ||
    code === "3D000" ||
    code === "42P01" ||
    code === "08006" ||
    code === "08001"
  ) {
    return new ApiError(
      503,
      "SEARCH_UNAVAILABLE",
      "Tender search is unavailable",
    );
  }
  return error;
};

router.get("/v1/tenders/search", publicHttpCache, async (req, res, next) => {
  try {
    const hasWorkspaceId = Object.prototype.hasOwnProperty.call(req.query, "workspaceId");
    let workspace: { id: string; type: string; accessMode: string; archivedAt: Date | null } | null = null;
    if (hasWorkspaceId) {
      res.locals.publicCachePolicy = "no-store";
      res.locals.disableConditionalCache = true;
      if (!res.locals.auth) throw new UnauthenticatedError();
      if (typeof req.query.workspaceId !== "string" || !isWorkspaceId(req.query.workspaceId)) {
        throw new InvalidParameterError("workspaceId is invalid", [{ field: "workspaceId", issue: "invalid_value" }]);
      }
      try {
        await assertWorkspaceRouteEnabled();
        const own = await requireWorkspaceMember(db, authContext(res).user.id, req.query.workspaceId);
        await assertWorkspaceRouteEnabled(own.type);
        workspace = { id: own.workspaceId, type: own.type, accessMode: own.accessMode, archivedAt: own.archivedAt };
      } catch (error) {
        if (!(error instanceof FeatureDisabledError || error instanceof WorkspaceNotFoundError)) throw error;
      }
    }
    const criteria = parseSearchQuery(req.query);
    if (hasWorkspaceId && !workspace) {
      // A missing or disabled context is a genuinely universal search: never
      // apply personal notification or legacy company-profile filters.
      criteria.notificationId = undefined;
      criteria.myRegion = false;
    }
    let procurementProfile: ReturnType<typeof ProcurementProfileSchema.parse> | null = null;
    if (workspace?.type === "procurement") {
      const [profile] = await db.select({ answers: workspaceProfilesTable.answers }).from(workspaceProfilesTable).where(eq(workspaceProfilesTable.workspaceId, workspace.id)).limit(1);
      procurementProfile = ProcurementProfileSchema.parse({ schemaVersion: 1, type: "procurement", answers: profile?.answers ?? {} });
      const keywords = procurementProfile.answers.selectedKeywords;
      if (!criteria.query && keywords?.length) criteria.query = keywords.slice(0, 3).join(" ");
    }
    let notification = null;
    if (criteria.notificationId) {
      if (!res.locals.auth) throw new UnauthenticatedError();
      const scope = await notificationSearchScope(
        authContext(res).user.id,
        criteria.notificationId,
        workspace?.id,
      );
      criteria.tenderIds = scope?.tenderIds ?? [];
      notification = scope?.context ?? null;
      res.locals.publicCachePolicy = "no-store";
    }
    if (criteria.myRegion) {
      if (!res.locals.auth) throw new UnauthenticatedError();
      criteria.serviceRegion = hasWorkspaceId
        ? procurementProfile?.answers.coverage
        : (await getCompanyProfile(authContext(res).user.id))?.coverage;
      res.locals.publicCachePolicy = "no-store";
    }
    const backend = await getSearchBackend();
    const result = await backend.search(criteria);
    res.json(
      SearchTendersResponse.parse({
        ...result,
        meta: {
          ...result.meta,
          ...(criteria.notificationId ? { notification } : {}),
          ...(hasWorkspaceId ? { workspace, tookMs: workspace ? result.meta.tookMs : 0 } : {}),
        },
      }),
    );
    if (criteria.page === 1) {
      scheduleTitleRewrites(
        result.data
          .filter((tender) => tender.displayTitleSource === "rules")
          .map((tender) => tender.id),
      );
    }
  } catch (error) {
    next(exposeSearchError(error));
  }
});

router.get("/v1/tenders/:id", publicHttpCache, async (req, res, next) => {
  try {
    const backend = await getSearchBackend();
    const tenderId = String(req.params.id);
    const tender = await backend.findById(tenderId);
    if (!tender) {
      throw new NotFoundError(`Tender ${tenderId} was not found`);
    }
    const detailsPending =
      tender.source.id === "pncp" && tender.detailsFetchedAt === null;
    if (detailsPending) res.locals.publicCachePolicy = "no-store";
    res.json(GetTenderByIdResponse.parse(tender));
    if (detailsPending) scheduleTenderDetailEnrichment(tender.id);
    if (tender.displayTitleSource === "rules")
      scheduleTitleRewrites([tender.id]);
  } catch (error) {
    next(exposeSearchError(error));
  }
});

router.get(
  "/v1/search/suggestions",
  publicHttpCache,
  async (req, res, next) => {
    try {
      const { query, limit } = parseSuggestionsQuery(req.query);
      const backend = await getSearchBackend();
      res.json(
        GetSearchSuggestionsResponse.parse(
          await backend.suggestions(query, limit),
        ),
      );
    } catch (error) {
      next(exposeSearchError(error));
    }
  },
);

export default router;
