import { Router, type IRouter } from "express";
import {
  GetSearchSuggestionsResponse,
  GetTenderByIdResponse,
  SearchTendersResponse,
} from "@workspace/api-zod";
import { NotFoundError } from "../lib/api-error";
import { parseSearchQuery, parseSuggestionsQuery } from "../lib/query-parser";
import { InMemoryTenderRepository } from "../repositories/in-memory-tender-repository";
import { SearchService } from "../services/search-service";

const router: IRouter = Router();
const searchService = new SearchService(new InMemoryTenderRepository());

router.get("/v1/tenders/search", (req, res) => {
  const criteria = parseSearchQuery(req.query);
  const response = SearchTendersResponse.parse(searchService.search(criteria));
  res.json(response);
});

router.get("/v1/tenders/:id", (req, res) => {
  const tender = searchService.findById(req.params.id);
  if (!tender) {
    throw new NotFoundError(`Tender ${req.params.id} was not found`);
  }

  res.json(GetTenderByIdResponse.parse(tender));
});

router.get("/v1/search/suggestions", (req, res) => {
  const { query, limit } = parseSuggestionsQuery(req.query);
  const response = GetSearchSuggestionsResponse.parse(
    searchService.suggestions(query, limit),
  );
  res.json(response);
});

export default router;
