import type {
  SearchResponse,
  SuggestionsResponse,
  TenderDetail,
} from "@workspace/api-zod";
import type { SearchCriteria } from "../domain/search";
import { ApiError } from "../lib/api-error";
import { logger } from "../lib/logger";

export interface SearchBackend {
  search(criteria: SearchCriteria): Promise<SearchResponse>;
  findById(id: string): Promise<TenderDetail | undefined>;
  suggestions(query: string, limit: number): Promise<SuggestionsResponse>;
}

let backend: Promise<SearchBackend> | undefined;

const createBackend = async (): Promise<SearchBackend> => {
  if (!process.env.DATABASE_URL) {
    logger.error("DATABASE_URL is not set; tender search requires PostgreSQL");
    throw new ApiError(
      503,
      "SEARCH_UNAVAILABLE",
      "DATABASE_URL is not set",
    );
  }

  const { PostgresTenderRepository } = await import(
    "../repositories/postgres-tender-repository"
  );
  logger.info("Search is reading tenders from PostgreSQL");
  return new PostgresTenderRepository();
};

export const getSearchBackend = (): Promise<SearchBackend> => {
  backend ??= createBackend();
  return backend;
};
