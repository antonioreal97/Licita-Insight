// Public shapes of the Search API v1.
// Source of truth: docs/contracts/search-v1.md — keep this file in lockstep with it.
// When the backend publishes the OpenAPI spec, the HTTP adapter maps generated types onto these.

export type TenderStatus = 'open' | 'under_review' | 'closed' | 'suspended' | 'cancelled';

export type Modality =
  | 'pregao_eletronico'
  | 'pregao_presencial'
  | 'concorrencia'
  | 'concorrencia_eletronica'
  | 'dispensa'
  | 'inexigibilidade'
  | 'credenciamento'
  | 'leilao'
  | 'dialogo_competitivo'
  | 'other';

export type SortOption = 'relevance' | 'deadline_asc' | 'published_desc' | 'value_desc' | 'value_asc';

export type SearchMode = 'keyword' | 'semantic' | 'hybrid';

export type TenderSearchParams = {
  q?: string;
  mode?: SearchMode;
  status?: TenderStatus[];
  modality?: Modality[];
  state?: string[];
  city?: string[];
  organizationId?: string[];
  sourceId?: string[];
  category?: string[];
  valueMin?: number;
  valueMax?: number;
  publishedFrom?: string;
  publishedTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
  facets?: boolean;
};

export type FacetBucket = { value: string; label: string; count: number };

export type SearchFacets = {
  status: FacetBucket[];
  modality: FacetBucket[];
  state: FacetBucket[];
  source: FacetBucket[];
  category: FacetBucket[];
  organization: FacetBucket[];
  valueRange: { min: number | null; max: number | null; histogram?: { from: number; to: number; count: number }[] };
  // v1.1 (optional so older servers stay valid)
  city?: FacetBucket[];
  groupTotals?: Record<'status' | 'modality' | 'state' | 'source' | 'category' | 'organization', number>;
};

export type Highlight = { field: 'title' | 'objectSummary' | 'items'; fragments: string[] };

export type TenderSummary = {
  id: string;
  title: string;
  objectSummary: string | null;
  organization: { id: string; name: string };
  purchasingUnit: string | null;
  modality: Modality;
  modalityLabel: string;
  status: TenderStatus;
  tenderNumber: string | null;
  /** v1.1: number without the modality prefix (e.g. "26000415/2026"). */
  tenderNumberShort?: string | null;
  estimatedValue: number | null;
  /** v1.1: why the value is null. */
  estimatedValueStatus?: 'disclosed' | 'confidential' | 'not_published';
  publishedAt: string | null;
  openingAt: string | null;
  proposalDeadline: string | null;
  location: { state: string | null; city: string | null; cityIbgeCode: string | null };
  source: { id: string; name: string; url: string | null };
  categories: { slug: string; label: string }[];
  relevance: { score: number | null; highlights: Highlight[] };
  updatedAt: string;
};

export type TenderItem = {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  estimatedUnitValue: number | null;
  estimatedTotalValue: number | null;
};

export type TenderDocument = {
  id: string;
  name: string;
  type: string;
  sizeBytes: number | null;
  url: string;
  publishedAt: string | null;
};

export type TimelineEvent = {
  at: string;
  type: 'published' | 'amended' | 'deadline_changed' | 'status_changed' | 'document_added';
  description: string;
};

export type TenderDetail = TenderSummary & {
  description: string | null;
  processNumber: string | null;
  items: TenderItem[];
  documents: TenderDocument[];
  timeline: TimelineEvent[];
  createdAt: string;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  totalIsEstimate: boolean;
};

export type TenderSearchResponse = {
  data: TenderSummary[];
  pagination: Pagination;
  facets: SearchFacets | null;
  meta: {
    query: string | null;
    searchMode: SearchMode;
    /** v1.1: why a semantic/hybrid request fell back to keyword. */
    searchModeFallbackReason?: 'not_available' | 'query_too_short' | null;
    tookMs: number;
    indexUpdatedAt: string | null;
  };
};

export type SearchSuggestion = {
  type: 'term' | 'organization' | 'category';
  value: string;
  label: string;
  count: number | null;
};

export type SuggestionsResponse = { suggestions: SearchSuggestion[] };

export type ApiErrorCode = 'INVALID_PARAMETER' | 'NOT_FOUND' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'SEARCH_UNAVAILABLE' | 'NETWORK_ERROR';

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: { field: string; issue: string }[];
    requestId?: string;
  };
};
