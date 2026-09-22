import type { TenderDetail } from "@workspace/api-zod";
import {
  createSearchFixtureTenders,
  SEARCH_FIXTURE_INDEX_UPDATED_AT,
} from "../data/seed-tenders";
import type { TenderRepository } from "../domain/search";

export class InMemoryTenderRepository implements TenderRepository {
  readonly #tenders: readonly TenderDetail[];

  constructor(tenders: readonly TenderDetail[] = createSearchFixtureTenders()) {
    this.#tenders = tenders;
  }

  findAll(): readonly TenderDetail[] {
    return this.#tenders;
  }

  findById(id: string): TenderDetail | undefined {
    return this.#tenders.find((tender) => tender.id === id);
  }

  getIndexUpdatedAt(): Date {
    return SEARCH_FIXTURE_INDEX_UPDATED_AT;
  }
}
