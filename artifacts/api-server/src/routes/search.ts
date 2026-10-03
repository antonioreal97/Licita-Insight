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

const router: IRouter = Router();

const errorCode = (error: unknown): string | undefined => {
  if (!error || typeof error !== "object") return undefined;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return errorCode(error.cause);
  if ("errors" in error && Array.isArray(error.errors)) {
    for (const nested of error.errors) {
      const code = errorCode(nested);
      if (code) return code;
    }
  }
  return undefined;
};

const exposeSearchError = (error: unknown): unknown => {
  if (error instanceof ApiError) return error;
  logger.error({ err: error }, "Search failed");
  const code = errorCode(error);
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
    res.json(GetTenderByIdResponse.parse(tender));
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
