import type {
  Modality,
  SearchMode,
  SortOption,
  TenderDetail,
  TenderStatus,
} from "@workspace/api-zod";

export type FacetGroup =
  | "new"
  | "status"
  | "modality"
  | "state"
  | "city"
  | "source"
  | "category"
  | "organization"
  | "platform"
  | "valueRange";

export interface SearchCriteria {
  query: string | null;
  mode: SearchMode;
  status: TenderStatus[];
  modality: Modality[];
  state: string[];
  city: string[];
  organizationId: string[];
  sourceId: string[];
  category: string[];
  platform: string[];
  newOnly: boolean;
  valueMin?: number;
  valueMax?: number;
  publishedFrom?: Date;
  publishedTo?: Date;
  deadlineFrom?: Date;
  deadlineTo?: Date;
  sort: SortOption;
  page: number;
  pageSize: number;
  facets: boolean;
}

export interface TenderRepository {
  findAll(): readonly TenderDetail[];
  findById(id: string): TenderDetail | undefined;
  getIndexUpdatedAt(): Date | null;
}
