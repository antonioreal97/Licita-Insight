// Public shapes of the Search API v1 and the Account API v1.
// Source of truth: docs/contracts/search-v1.md and docs/contracts/account-v1.md — keep this file in lockstep with them.
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

export type ApiErrorCode =
  | 'INVALID_PARAMETER'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SEARCH_UNAVAILABLE'
  | 'NETWORK_ERROR'
  // account-v1
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'SUBSCRIPTION_REQUIRED'
  | 'BILLING_UNAVAILABLE';

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    requestId?: string;
  };
};

/** `existingId` comes with 409 `duplicate` (saved search with the same query). */
export type ApiErrorDetail = { field: string; issue: string; existingId?: string };

// Account API v1 — source of truth: docs/contracts/account-v1.md.

export type User = { id: string; email: string; name: string | null; avatarUrl: string | null; createdAt: string };

export type SessionResponse = { user: User };

export type BillingStatus = 'none' | 'pending' | 'active' | 'past_due' | 'canceled';

export type BillingResponse = {
  status: BillingStatus;
  entitled: boolean;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
};

export type BillingCheckoutResponse = { url: string };

export type SavedTender = { tender: TenderSummary; savedAt: string; monitored: boolean; monitoredAt: string | null };

export type SavedTendersParams = { page?: number; pageSize?: number; monitored?: boolean };

export type SavedTendersResponse = { data: SavedTender[]; pagination: Pagination };

export type SavedTenderIdsResponse = { saved: string[]; monitored: string[] };

export type ImportSavedTendersResponse = {
  imported: number;
  alreadySaved: number;
  notFound: string[];
  /** Ids not imported because the account reached the 500 saved-tender limit. */
  skippedByLimit: number;
};

export type SavedSearch = {
  id: string;
  /** 1–80 chars. */
  name: string;
  /** Canonical query string (`searchParamsToUrl` without `page`, `pageSize`, `view` and the leading `?`). */
  query: string;
  alertsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt: string | null;
  /** New tenders since the last visit; reset by `/seen`. */
  newMatchesCount: number;
};

export type SavedSearchesResponse = { data: SavedSearch[] };

export type CreateSavedSearchBody = { name: string; query: string; alertsEnabled: boolean };

export type UpdateSavedSearchBody = { name?: string; query?: string; alertsEnabled?: boolean };

export type NotificationType =
  'tender_deadline_changed' | 'tender_status_changed' | 'tender_document_added' | 'tender_value_changed' | 'saved_search_new_matches';

export type Notification = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  /** tender_* types. */
  tender: { id: string; title: string; tenderNumberShort: string | null } | null;
  change: { field: string; from: string | number | null; to: string | number | null } | null;
  /** saved_search_* types. */
  savedSearch: { id: string; name: string; query: string } | null;
  matchCount: number | null;
  /** Up to 20 ids of the new tenders (saved_search_new_matches). */
  tenderIds: string[];
};

export type NotificationsParams = { unreadOnly?: boolean; page?: number; pageSize?: number };

export type NotificationsResponse = { data: Notification[]; pagination: Pagination; unreadCount: number };

export type UnreadCountResponse = { unreadCount: number };

export type MarkNotificationsReadBody = { ids?: string[]; all?: boolean };

export type OpportunityStatus = 'open' | 'upcoming' | 'closed' | 'undated';

export type OpportunityProgram = 'audiovisual' | 'lpg' | 'fac' | 'fsa';

export type OpportunitySearchParams = {
  q?: string;
  state?: string[];
  installation?: string[];
  status?: OpportunityStatus[];
  program?: OpportunityProgram[];
  deadlineFrom?: string;
  deadlineTo?: string;
  page?: number;
  pageSize?: number;
  facets?: boolean;
};

export type OpportunitySummary = {
  id: string;
  title: string;
  summary: string | null;
  organizationName: string;
  status: OpportunityStatus;
  program: OpportunityProgram;
  registrationFrom: string | null;
  registrationTo: string | null;
  state: string | null;
  installation: { id: string; name: string; uf: string };
  sourceUrl: string | null;
  updatedAt: string;
};

export type OpportunitySearchResponse = {
  data: OpportunitySummary[];
  pagination: Pagination;
  facets: {
    status: FacetBucket[];
    state: FacetBucket[];
    installation: FacetBucket[];
    program: FacetBucket[];
  } | null;
  meta: {
    query: string | null;
    tookMs: number;
    indexUpdatedAt: string | null;
    installationIssues: { installationId: string; name: string; message: string }[];
    gaps: { uf: string; name: string }[];
  };
};

