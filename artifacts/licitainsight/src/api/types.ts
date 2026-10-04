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
  displayTitle: string;
  displayTitleSource: 'rules' | 'model' | null;
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
  /** Null until PNCP items and documents have been fetched. */
  detailsFetchedAt: string | null;
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
  | 'BILLING_UNAVAILABLE'
  // ai-v1
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_UNAVAILABLE'
  // scale-protection-v1: overload protection (all transient, retryable)
  | 'SERVICE_OVERLOADED'
  | 'REQUEST_TIMEOUT'
  | 'PAYLOAD_TOO_LARGE';

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

/** What grants access (priority subscription > trial > dev). Optional until every API ships it (CODEX_HANDOFF-006/007). */
/** `beta`: free closed-beta access granted by the owner, outside Asaas. */
export type BillingSource = 'subscription' | 'trial' | 'beta' | 'dev';

export type BillingResponse = {
  status: BillingStatus;
  entitled: boolean;
  currentPeriodEnd: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
  /** End of the free trial (ISO; length from `GET /billing/plan`). Absent on APIs without CODEX_HANDOFF-007. */
  trialEndsAt?: string | null;
  source?: BillingSource | null;
};

/** Public `GET /api/v1/billing/plan` (no session): the single plan and the trial length. */
export type PublicPlan = { monthlyBrl: number | null; trialDays: number; currency: 'BRL' };

export type BillingCheckoutResponse = { url: string };

/** A downloaded attachment (e.g. `GET /me/export`). `filename` comes from `Content-Disposition`, `null` when absent. */
export type DownloadedFile = { blob: Blob; filename: string | null };

// Participation — source of truth: docs/contracts/participation-v1.md. Everything here is the user's own declaration.
export type ParticipationStage = 'analyzing' | 'participating' | 'submitted' | 'awaiting_result' | 'completed' | 'dismissed';

export type ChecklistKey =
  | QualificationType
  | 'site_visit'
  | 'samples'
  | 'bid_guarantee';

/** No entry for a key means `unknown`, never a validated document. */
export type ChecklistState = 'have' | 'missing' | 'unknown';

export type ParticipationChecklistItem = { key: ChecklistKey; state: ChecklistState; note: string | null; updatedAt: string };

export type ParticipationTransition = { from: ParticipationStage | null; to: ParticipationStage; at: string; source: 'user' };

export type SavedTender = {
  tender: TenderSummary;
  savedAt: string;
  monitored: boolean;
  monitoredAt: string | null;
  stage: ParticipationStage;
  stageAt: string;
  participationSource: 'user';
  /** ≤ 200 chars. */
  protocol: string | null;
  /** ≤ 500 chars. */
  nextAction: string | null;
  nextActionDeadline: string | null;
  checklist: ParticipationChecklistItem[];
  history: ParticipationTransition[];
};

/**
 * Body of `PUT /me/saved-tenders/{id}`: omitted fields are preserved, `null` clears. The checklist is a patch by key
 * (omitted keys and notes are kept). The server owns `history`, `stageAt`, `participationSource` and the monitoring side effects.
 */
export type SaveTenderBody = {
  monitored?: boolean;
  stage?: ParticipationStage;
  protocol?: string | null;
  nextAction?: string | null;
  nextActionDeadline?: string | null;
  checklist?: { key: ChecklistKey; state: ChecklistState; note?: string | null }[];
};

export type SavedTendersParams = {
  page?: number;
  pageSize?: number;
  monitored?: boolean;
  stage?: ParticipationStage;
  /** `deadline`: nearest proposal deadline first, nulls last. Default `saved_at` (newest first). */
  sort?: 'saved_at' | 'deadline';
  /** Only future proposal deadlines. */
  upcoming?: boolean;
};

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
  | 'tender_deadline_changed'
  | 'tender_status_changed'
  | 'tender_document_added'
  | 'tender_value_changed'
  | 'saved_search_new_matches'
  | 'profile_new_matches'
  | 'trial_ending';

export type ProfileMatchNotification = {
  id: string;
  title: string;
  organizationName: string;
  proposalDeadline: string | null;
  level: 'high';
};

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
  /** Up to five high-fit tender snapshots (profile_new_matches). */
  profileMatches: ProfileMatchNotification[];
};

export type NotificationsParams = { unreadOnly?: boolean; page?: number; pageSize?: number };

export type NotificationsResponse = { data: Notification[]; pagination: Pagination; unreadCount: number };

export type UnreadCountResponse = { unreadCount: number };

export type MarkNotificationsReadBody = { ids?: string[]; all?: boolean };

/** E-mail alerts (CODEX_HANDOFF-009, proposal): daily digest at 07:00 (São Paulo) and immediate mail for critical changes. */
export type EmailPreferences = { digest: 'daily' | 'off'; immediateCritical: boolean };

/** `GET/PUT /api/v1/me/notification-preferences` — outside the subscription gate. */
export type NotificationPreferences = { email: EmailPreferences; profileAlerts: boolean; emailAddress: string; updatedAt: string | null };

/** Partial PUT body: only the fields sent change. */
export type UpdateNotificationPreferencesBody = { email?: Partial<EmailPreferences>; profileAlerts?: boolean };

export type UnsubscribeScope = 'all' | 'digest' | 'immediate';

/** Public `POST /api/v1/email/unsubscribe { token, scope }` (no session). Invalid token → 400 INVALID_PARAMETER. */
export type UnsubscribeResponse = { scope: UnsubscribeScope; email: EmailPreferences };

// AI v1 ("Perguntar ao edital") — source of truth: docs/contracts/ai-v1.md. Jev selects official passages; OpenAI may write a grounded summary from them.

/** `expired`: the documents were dropped from the index 90 days after the proposal deadline (unless a user saved the tender). Saving reopens it. */
export type TenderAskIndexStatus = 'not_started' | 'processing' | 'ready' | 'failed' | 'no_documents' | 'unsupported' | 'expired';

export type TenderAskDocument = { id: string; title: string; pages: number | null; status: 'processing' | 'ready' | 'failed' | 'unsupported' };

/** Per user and day in São Paulo; `resetsAt` is the next local midnight. */
export type AiQuota = { used: number; limit: number; resetsAt: string };

/** `GET /api/v1/tenders/:id/ask-status` (session). Signed-in users with access start the indexing by calling it. */
/** `unreadDocuments`: documents that failed or could not be read. The index is `ready` with a partial reading, so answers may be incomplete. */
export type TenderAskStatus = { index: TenderAskIndexStatus; documents: TenderAskDocument[]; unreadDocuments: number; quota: AiQuota };

/** `relevance` is Jev's probability (0–1) that the passage answers the question; only passages above the threshold come back. */
export type AskTenderPassage = { documentId: string; documentTitle: string; documentUrl: string; page: number; text: string; relevance: number };

export type AiGeneratedSummary = { text: string; citations: number[]; model: string };

/** `POST /api/v1/tenders/:id/ask { question }` (session + CSRF + access). */
export type AskTenderResult = {
  status: 'answered' | 'not_found' | 'processing';
  passages: AskTenderPassage[];
  summary: AiGeneratedSummary | null;
  model: string;
  quota: AiQuota;
};

// Ficha do edital (CODEX_HANDOFF-015, proposal): one official passage per key field. Absence is `not_found`, never a "no".

export type SheetFieldId =
  | 'consortium'
  | 'subcontracting'
  | 'me_epp'
  | 'site_visit'
  | 'samples'
  | 'bid_guarantee'
  | 'contract_guarantee'
  | 'penalties'
  | 'technical_qualification'
  | 'financial_qualification'
  | 'contract_term'
  | 'delivery_term'
  | 'price_adjustment';

export type SheetEvidence = { documentTitle: string; documentUrl: string; page: number; text: string };

/** `answer` is a category key for categorical fields (e.g. `forbidden`), `null` for passage-only fields or when unsure. */
export type SheetField = { id: SheetFieldId; status: 'found' | 'not_found'; answer: string | null; confidence: number | null; evidence: SheetEvidence | null };

/** `GET /api/v1/tenders/:id/sheet` (session + access). `status` mirrors the document index. */
export type QualificationType = 'ato_societario' | 'regularidade_fiscal' | 'regularidade_trabalhista' | 'qualificacao_tecnica' | 'qualificacao_economica';

/** One requirement the edital's documents state explicitly, with its own passage. Absent types are not "not required" — only "not found". */
export type QualificationItem = { type: QualificationType; evidence: SheetEvidence; confidence: number };

export type TenderSheet = {
  status: 'not_started' | 'processing' | 'ready' | 'failed' | 'no_documents' | 'unsupported' | 'expired';
  fields: SheetField[];
  /** Not exhaustive: dedup keeps the strongest passage per (type, page), so a sibling requirement sharing a page can be left out. */
  qualificationChecklist: QualificationItem[];
  summary: AiGeneratedSummary | null;
  unreadDocuments: number;
  model: string | null;
  generatedAt: string | null;
};

// Aderência (CODEX_HANDOFF-013, proposal): company profile × tender. Rules run in code; Jev only judges the semantic match.

export type CompanySize = 'me_epp' | 'cooperative' | 'other';

export type CompanyCoverage = { scope: 'national' } | { scope: 'states'; states: string[] };

export type CompanyProfileInput = {
  /** 20–600 chars: what the company supplies. */
  description: string;
  /** 1–20 terms, 2–80 chars each. */
  offerings: string[];
  /** 0–20 terms the company does not supply. */
  exclusions: string[];
  coverage: CompanyCoverage;
  /** Reais; either side may be open. */
  valueRange: { min: number | null; max: number | null };
  size: CompanySize;
};

export type CompanyProfile = CompanyProfileInput & { version: number; updatedAt: string };

/** `GET/PUT /api/v1/me/company-profile` (session; editing does not need access, the fit does). */
export type CompanyProfileResponse = { profile: CompanyProfile | null };

export type FitEvidence = { documentTitle: string; documentUrl: string; page: number; text: string };

export type FitReason =
  | { kind: 'offering_match'; terms: string[] }
  | { kind: 'exclusion'; terms: string[] }
  | { kind: 'out_of_coverage'; state: string | null }
  | { kind: 'out_of_value_range'; estimatedValue: number }
  | { kind: 'value_not_published' }
  | { kind: 'size_restricted'; restriction: 'me_epp_exclusive' | 'me_epp_quota'; evidence: FitEvidence };

export type FitLevel = 'high' | 'medium' | 'low';

export type TenderFit = {
  /** `filtered`: an explicit rule (area, value) ruled it out, no model call. `pending`: queued. */
  status: 'ready' | 'pending' | 'filtered';
  level: FitLevel | null;
  score: number | null;
  reasons: FitReason[];
  model: string | null;
  checkedAt: string | null;
};

/** `GET /api/v1/me/fit?tenderIds=…` (session + access, ≤ 100 ids). No profile → `profileVersion: null`, empty results. */
export type TenderFitsResponse = { profileVersion: number | null; results: Record<string, TenderFit> };

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
