import { Router, type IRouter } from "express";
import {
  GetSearchSuggestionsResponse,
  GetTenderByIdResponse,
  SearchTendersResponse,
} from "@workspace/api-zod";
import { ApiError, NotFoundError } from "../lib/api-error";
import { logger } from "../lib/logger";
import { parseSearchQuery, parseSuggestionsQuery } from "../lib/query-parser";
import { getSearchBackend } from "../services/search-backend";
import { publicHttpCache } from "../middlewares/request-protection";
import { scheduleTitleRewrites } from "../titles/title-rewrite";
import { scheduleTenderDetailEnrichment } from "../ingest/schedule-tender-detail-enrichment";
import { pgErrorCode } from "../lib/pg-error";

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
    return new ApiError(503, "SEARCH_UNAVAILABLE", "Tender search is unavailable");
  }
  return error;
};

router.get("/v1/tenders/search", publicHttpCache, async (req, res, next) => {
  try {
    const criteria = parseSearchQuery(req.query);
    const backend = await getSearchBackend();
    const result = await backend.search(criteria);
    res.json(SearchTendersResponse.parse(result));
    if (criteria.page === 1) {
      scheduleTitleRewrites(
        result.data.filter((tender) => tender.displayTitleSource === "rules").map((tender) => tender.id),
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
    const detailsPending = tender.source.id === "pncp" && tender.detailsFetchedAt === null;
    if (detailsPending) res.locals.publicCachePolicy = "no-store";
    res.json(GetTenderByIdResponse.parse(tender));
    if (detailsPending) scheduleTenderDetailEnrichment(tender.id);
    if (tender.displayTitleSource === "rules") scheduleTitleRewrites([tender.id]);
  } catch (error) {
    next(exposeSearchError(error));
  }
});

router.get("/v1/search/suggestions", publicHttpCache, async (req, res, next) => {
  try {
    const { query, limit } = parseSuggestionsQuery(req.query);
    const backend = await getSearchBackend();
    res.json(
      GetSearchSuggestionsResponse.parse(await backend.suggestions(query, limit)),
    );
  } catch (error) {
    next(exposeSearchError(error));
  }
});

export default router;
