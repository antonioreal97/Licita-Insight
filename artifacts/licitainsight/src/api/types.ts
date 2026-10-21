// Public shapes of the Search API v1 and the Account API v1.
// Source of truth: docs/contracts/search-v1.md and docs/contracts/account-v1.md — keep this file in lockstep with them.
// When the backend publishes the OpenAPI spec, the HTTP adapter maps generated types onto these.

export type TenderStatus = 'open' | 'under_review' | 'closed' | 'suspended' | 'cancelled' | 'direct';

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

export type SortOption = 'relevance' | 'deadline_asc' | 'published_desc' | 'first_seen_desc' | 'value_desc' | 'value_asc';

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
  platform?: string[];
  newOnly?: boolean;
  /** Exact tender snapshot captured by an owned notification. Never persisted in saved searches. */
  notification?: string;
  myRegion?: boolean;
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
  /** Optional so servers before the platform column stay valid. */
  platform?: FacetBucket[];
  groupTotals?: Partial<Record<'status' | 'modality' | 'state' | 'source' | 'category' | 'organization' | 'platform', number>>;
  newCount: number;
};

/**
 * Where the dispute happens, normalized from the PNCP publishing system. Only `platform` is a known
 * bidding room; `source_system` is management software that published the tender, not the room.
 */
export type TenderPlatform = {
  slug: string;
  label: string;
  kind: 'platform' | 'source_system' | 'other' | 'unknown';
  url: string | null;
};

export type Highlight = { field: 'title' | 'objectSummary' | 'items'; fragments: string[] };

/** Why the estimated value published by the source looks wrong. */
export type EstimatedValueFlag = 'absolute_ceiling' | 'dispensa_legal_limit' | 'modality_outlier';

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
  /** Set when the official value looks wrong: it is shown with a warning and left out of sums, value filters and rankings. */
  estimatedValueFlag?: EstimatedValueFlag | null;
  publishedAt: string | null;
  openingAt: string | null;
  proposalDeadline: string | null;
  location: { state: string | null; city: string | null; cityIbgeCode: string | null };
  source: { id: string; name: string; url: string | null };
  /** Null until the tender is ingested or backfilled with the platform column. */
  platform?: TenderPlatform | null;
  categories: { slug: string; label: string }[];
  relevance: { score: number | null; highlights: Highlight[] };
  updatedAt: string;
  /** When the tender first entered Pardal, independently of the PNCP publication date. */
  firstSeenAt: string;
  /** Calculated by the API server against the configured rolling window. */
  isNew: boolean;
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
    notification?: {
      id: string;
      type: 'saved_search_new_matches' | 'profile_new_matches';
      createdAt: string;
      matchCount: number;
      storedTenderCount: number;
      savedSearchName: string | null;
      savedSearchQuery: string | null;
    } | null;
  };
};

export type SearchSuggestion = {
  type: 'term' | 'organization' | 'category';
  value: string;
  label: string;
  count: number | null;
};

export type SuggestionsResponse = { suggestions: SearchSuggestion[] };

// Transparency API v1. Source: PNCP data normalized by the backend.

export type TransparencySupplier = {
  type: 'CNPJ' | 'CPF' | 'PE' | string | null;
  name: string | null;
  identifier: string | null;
};

export type TransparencyProvenance = {
  source: 'PNCP' | string;
  fetchedAt: string | null;
};

export type TransparencyValueSemantics = {
  contractValues?: string;
  resultValues?: string;
  paymentValues?: string;
  [key: string]: string | undefined;
};

export type TransparencyMeta = {
  coverage?: string;
  indexUpdatedAt?: string | null;
  valueSemantics?: TransparencyValueSemantics;
};

export type TransparencyContract = {
  id: string;
  pncpControlNumber: string | null;
  purchasePncpControlNumber: string | null;
  tenderId: string | null;
  contractNumber: string | null;
  organizationName: string | null;
  location: { state: string | null; city: string | null };
  supplier: TransparencySupplier | null;
  object: string | null;
  values: {
    initial: number | null;
    global: number | null;
    accumulated: number | null;
    installment: number | null;
  };
  dates: {
    signature: string | null;
    validFrom: string | null;
    validTo: string | null;
    publishedAt: string | null;
    updatedAt: string | null;
  };
  officialUrl: string | null;
  provenance: TransparencyProvenance;
};

export type TransparencyResult = {
  id: string;
  purchasePncpControlNumber: string | null;
  tenderId: string | null;
  itemNumber: number | string | null;
  resultSequence: number | string | null;
  status: {
    id: string | number | null;
    name: string | null;
    active: boolean | null;
    cancelledAt: string | null;
    cancelReason: string | null;
  };
  supplier: TransparencySupplier | null;
  values: {
    quantityHomologated: number | null;
    unitValueHomologated: number | null;
    totalValueHomologated: number | null;
    discountPercent: number | null;
  };
  resultDate: string | null;
  officialUrl: string | null;
  provenance: TransparencyProvenance;
};

export type TransparencyContractSort = 'published_desc' | 'published_asc' | 'value_desc' | 'value_asc';

export type TransparencyContractSearchParams = {
  q?: string;
  state?: string;
  publishedFrom?: string;
  publishedTo?: string;
  valueMin?: number;
  valueMax?: number;
  page?: number;
  pageSize?: number;
  sort?: TransparencyContractSort;
};

export type TransparencyContractsResponse = {
  data: TransparencyContract[];
  pagination: Pagination;
  meta: TransparencyMeta;
};

export type TransparencyTenderContractsResponse = {
  data: TransparencyContract[];
  meta: TransparencyMeta;
};

export type TransparencyTenderResultsResponse = {
  data: TransparencyResult[];
  meta: TransparencyMeta;
};

// Award history: similar purchases by the same organization (`GET /v1/tenders/{id}/award-history`).
export type AwardHistoryWinner = {
  /** Only companies, and only when `meta.access.unlocked`. Natural persons (CPF) are never named. */
  name: string | null;
  cnpj: string | null;
  kind: 'company' | 'individual' | 'foreign' | 'unidentified';
  wins: number;
};

export type AwardHistoryRecentPurchase = {
  purchasePncpControlNumber: string;
  tenderId: string | null;
  date: string | null;
  object: string | null;
  value: number | null;
  valueSource: 'results' | 'contracts' | null;
  winners: AwardHistoryWinner[];
  officialUrl: string | null;
};

export type AwardHistory = {
  tenderId: string;
  scope: 'unit' | 'organization';
  organizationName: string;
  purchasingUnit: string | null;
  windowMonths: number;
  since: string;
  criteria: { keywords: string[]; categories: { slug: string; label: string }[]; rule: string };
  purchases: { total: number; last12Months: number; withResults: number };
  winners: { distinct: number; top: AwardHistoryWinner[] };
  prices: {
    purchaseValue: { min: number; median: number; max: number; count: number } | null;
    discountPercent: { p25: number; median: number; p75: number; count: number } | null;
  };
  recent: AwardHistoryRecentPurchase[];
};

export type AwardHistoryMeta = {
  coverage: string;
  valueSemantics: string;
  access: { winnerNames: 'entitled' | 'public'; unlocked: boolean };
};

export type AwardHistoryResponse = {
  data: AwardHistory;
  meta: AwardHistoryMeta;
};

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
export type UsagePurpose = 'procurement' | 'culture' | 'funding' | 'research' | 'study';
export type ApplicantType = 'individual' | 'mei' | 'company' | 'nonprofit';
export type AccountUsageProfile = { usagePurposes: UsagePurpose[]; applicantTypes: ApplicantType[]; usageInviteDismissed: boolean };
export type AccountUsageProfilePatch = Partial<AccountUsageProfile>;

export type SessionResponse = { user: User };

export type BillingStatus = 'none' | 'pending' | 'active' | 'past_due' | 'canceled';

/** What grants access (priority subscription > trial > dev). Optional until every API ships it (CODEX_HANDOFF-006/007). */
/** `beta`: free closed-beta access granted by the owner, outside Asaas. */
export type BillingSource = 'subscription' | 'coupon' | 'trial' | 'beta' | 'dev';

export type BillingResponse = {
  status: BillingStatus;
  entitled: boolean;
  currentPeriodEnd: string | null;
  couponAccessUntil?: string | null;
  canCancel: boolean;
  monthlyBrl: number | null;
  /** End of the free trial (ISO; length from `GET /billing/plan`). Absent on APIs without CODEX_HANDOFF-007. */
  trialEndsAt?: string | null;
  source?: BillingSource | null;
};

/** One state in public `GET /api/v1/public/tenders/by-state` — contract: docs/contracts/public-tenders-by-state-v1.md. */
export type OpenTendersByState = {
  state: string;
  openTenders: number;
  /** Sum of the published estimated values, without the ones flagged as implausible; `null` when the state has none to add. */
  estimatedValueTotal: number | null;
  updatedAt: string | null;
};

/** Always the 27 states. The server recomputes it at most once every 15 minutes. */
export type OpenTendersByStateResponse = {
  data: OpenTendersByState[];
  meta: { totalOpenTenders: number; generatedAt: string; indexUpdatedAt: string | null; cacheTtlSeconds: number };
};

/** Public `GET /api/v1/billing/plan` (no session): the single plan and the trial length. */
export type PublicPlan = { monthlyBrl: number | null; trialDays: number; currency: 'BRL' };

export type BillingCheckoutResponse = { url: string };
export type CouponRedemptionResponse = { accessUntil: string; durationDays: 7 | 30; alreadyRedeemed: boolean };

/** A downloaded attachment (e.g. `GET /me/export`). `filename` comes from `Content-Disposition`, `null` when absent. */
export type DownloadedFile = { blob: Blob; filename: string | null };

// Participation — source of truth: docs/contracts/participation-v1.md. Everything here is the user's own declaration.
export type ParticipationStage = 'analyzing' | 'participating' | 'submitted' | 'awaiting_result' | 'completed' | 'dismissed';

export type ChecklistKey = QualificationType | 'site_visit' | 'samples' | 'bid_guarantee';

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
  | 'trial_ending'
  | 'company_document_expiring';

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
  tender: { id: string; title: string; tenderNumberShort: string | null; isNew: boolean } | null;
  change: { field: string; from: string | number | null; to: string | number | null } | null;
  /** saved_search_* types. */
  savedSearch: { id: string; name: string; query: string } | null;
  matchCount: number | null;
  newMatchCount: number | null;
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

export type CompanyDocumentKind =
  | 'sicaf'
  | 'cnd_federal'
  | 'crf_fgts'
  | 'cndt'
  | 'state_tax_clearance'
  | 'municipal_tax_clearance'
  | 'bankruptcy_clearance'
  | 'balance_sheet'
  | 'articles_of_association'
  | 'technical_capacity_certificate'
  | 'professional_council_registration'
  | 'platform_registration';
export type CompanyDocumentStatus = 'have' | 'missing' | 'not_applicable';
export type CompanyDocument = {
  id: string;
  kind: CompanyDocumentKind;
  status: CompanyDocumentStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  reference: string | null;
  updatedAt: string;
};
export type CompanyDocumentCatalogItem = {
  kind: CompanyDocumentKind;
  label: string;
  description: string;
  glossaryId: string;
  officialUrl: string;
  suggestedValidityDays: number | null;
};
export type CompanyDocumentsResponse = {
  items: CompanyDocumentChecklistItem[];
  /** `unknownValidity`: marked "Tenho" for a kind that expires, without a date; never counted as ready. */
  progress: { ready: number; total: number; unknownValidity: number };
  asOf: string;
};
export type CompanyDocumentChecklistItem = { catalog: CompanyDocumentCatalogItem; document: CompanyDocument | null };
export type CompanyDocumentPut = {
  status: CompanyDocumentStatus;
  issuedAt?: string | null;
  expiresAt?: string | null;
  reference?: string | null;
};

export type RecommendationPreferences = {
  personalizationEnabled: boolean;
  /** Off by default. International calls enter recommendations and profile matching only when on. */
  showInternationalOpportunities: boolean;
  updatedAt: string | null;
};
export type RecommendationReason = {
  kind: 'profile' | 'interest' | 'monitored' | 'saved' | 'saved_search' | 'search' | 'location' | 'organization' | 'value' | 'platform';
  text: string;
};
export type Recommendation = { tender: TenderSummary; score: number; reasons: RecommendationReason[]; generatedAt: string };
export type RecommendationsResponse = { data: Recommendation[]; opportunities?: Array<{ opportunity: OpportunitySummary; score: number; reasons: string[] }>; pagination: Pagination };
export type RecommendationEvent =
  { type: 'search'; query: string } | { type: 'tender_view'; tenderId: string } | { type: 'click'; tenderId?: string } | { type: 'interest'; tenderId: string };

export type UnsubscribeScope = 'all' | 'digest' | 'immediate';

/** Public `POST /api/v1/email/unsubscribe { token, scope }` (no session). Invalid token → 400 INVALID_PARAMETER. */
export type UnsubscribeResponse = { scope: UnsubscribeScope; email: EmailPreferences };

// AI v1 ("Perguntar ao edital") — source of truth: docs/contracts/ai-v1.md. Jev selects official passages; OpenAI may write a grounded summary from them.

/** `expired`: the documents were dropped from the index 90 days after the proposal deadline (unless a user saved the tender). Saving reopens it. */
export type TenderAskIndexStatus = 'not_started' | 'processing' | 'ocr_processing' | 'ready' | 'failed' | 'no_documents' | 'unsupported' | 'expired';

export type TenderAskDocument = {
  id: string;
  title: string;
  pages: number | null;
  status: 'processing' | 'ocr_processing' | 'ready' | 'failed' | 'unsupported';
  ocrLowConfidencePages: number[];
};

export type DocumentReadingSummary = {
  read: number;
  total: number;
  unread: Array<{ id: string; title: string; url: string; reason: string }>;
};

/**
 * Per user and day in São Paulo, counted in processes: a tender with readable documents spends 1 the first time
 * the user asks about it or opens its sheet that day. `counted`: this tender already spent it, so it is free now.
 * `resetsAt` is the next local midnight.
 */
export type AiQuota = { used: number; limit: number; resetsAt: string; counted: boolean };

/** `GET /api/v1/tenders/:id/ask-status` (session). Signed-in users with access start the indexing by calling it. */
/** `unreadDocuments`: documents that failed or could not be read. The index is `ready` with a partial reading, so answers may be incomplete. */
export type TenderAskStatus = {
  index: TenderAskIndexStatus;
  documents: TenderAskDocument[];
  unreadDocuments: number;
  documentReading: DocumentReadingSummary;
  quota: AiQuota;
};

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
  status: TenderAskIndexStatus;
  fields: SheetField[];
  /** Not exhaustive: dedup keeps the strongest passage per (type, page), so a sibling requirement sharing a page can be left out. */
  qualificationChecklist: QualificationItem[];
  summary: AiGeneratedSummary | null;
  unreadDocuments: number;
  documentReading: DocumentReadingSummary;
  model: string | null;
  generatedAt: string | null;
  /** Prior registration clause found by rules in the edital text; absent on older servers. */
  registrationRequirement?: RegistrationRequirement | null;
};

export type RegistrationRequirement = {
  /** Systems named in the clause; empty when the edital only says "plataforma". */
  systems: { slug: string; label: string }[];
  businessDaysBefore: number | null;
  /** Proposal deadline the count starts from (YYYY-MM-DD). */
  referenceDate: string | null;
  /** Counting weekends and national holidays only (YYYY-MM-DD). */
  deadline: string | null;
  evidence: SheetEvidence;
};

// Aderência (CODEX_HANDOFF-013, proposal): company profile × tender. Rules run in code; Jev only judges the semantic match.

export type CompanySize = 'me_epp' | 'cooperative' | 'other';

export type MunicipalityReference = { ibgeCode: string; name: string; state: string };
export type CompanyMacroregion = 'north' | 'northeast' | 'central_west' | 'southeast' | 'south';
export type CompanyCoverageMode = 'strict' | 'prioritize';
export type CompanyCoverage =
  | { scope: 'national'; mode: CompanyCoverageMode; acceptsRemote: boolean }
  | {
      scope: 'custom';
      mode: CompanyCoverageMode;
      acceptsRemote: boolean;
      regions: CompanyMacroregion[];
      states: string[];
      municipalities: MunicipalityReference[];
      radius: { center: MunicipalityReference; km: 50 | 100 | 200 | 300 | 500 } | null;
    };

export type CompanyProfileInput = {
  /** 20–600 chars: what the company supplies. */
  description: string;
  /** 1–20 terms, 2–80 chars each. */
  offerings: string[];
  /** 0–20 terms the company does not supply. */
  exclusions: string[];
  /** Canonical taxonomy slugs explicitly chosen by the user. */
  selectedCategories: string[];
  /** Materialized vocabulary display terms explicitly chosen by the user. */
  selectedKeywords: string[];
  /** Materialized vocabulary terms that must remove candidates. */
  excludedKeywords: string[];
  /** Bidding rooms and SICAF the company is registered in (`ProfilePlatform.slug`). Does not affect the fit. */
  registeredPlatforms: string[];
  coverage: CompanyCoverage;
  /** Reais; either side may be open. */
  valueRange: { min: number | null; max: number | null };
  size: CompanySize;
};

export type CompanyProfile = CompanyProfileInput & { version: number; updatedAt: string };

/** `GET/PUT /api/v1/me/company-profile` (session; editing does not need access, the fit does). */
export type CompanyProfileResponse = { profile: CompanyProfile | null };

export type ProfileCategory = { slug: string; label: string; openTenderCount: number };
export type ProfileCategoriesResponse = { data: ProfileCategory[] };
export type ProfileMunicipalitiesResponse = { data: MunicipalityReference[] };
export type CompanyRegionPreviewResponse = { count: number };
/** `openTenderCount` is null for SICAF, a registry rather than a bidding room. */
export type ProfilePlatform = {
  slug: string;
  label: string;
  url: string | null;
  kind: 'platform' | 'registry';
  openTenderCount: number | null;
};
export type ProfilePlatformsResponse = { data: ProfilePlatform[] };
export type ProfileKeywordSuggestion = {
  normalizedTerm: string;
  displayTerm: string;
  openTenderCount: number;
  predominantCategory: { slug: string; label: string } | null;
  related: boolean;
};
export type ProfileKeywordSuggestionsResponse = { data: ProfileKeywordSuggestion[] };
export type ProfileMatchPreview = { estimatedOpenTenderCount: number };
export type ProfileDescriptionSuggestions = {
  keywords: ProfileKeywordSuggestion[];
  categories: ProfileCategory[];
  estimatedOpenTenderCount: number;
};

export type FitEvidence = { documentTitle: string; documentUrl: string; page: number; text: string };

export type FitReason =
  | { kind: 'offering_match'; terms: string[] }
  | { kind: 'exclusion'; terms: string[] }
  | { kind: 'service_region'; text: string }
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

export type TenderRequirementHighlightCode =
  | 'me_epp_exclusive'
  | 'me_epp_quota'
  | 'site_visit'
  | 'bid_guarantee'
  | 'samples'
  | 'technical_certificate'
  | 'technical_qualification'
  | 'minimum_capital'
  | 'contract_guarantee';

/** One key requirement read from the tender's already-ready sheet; `label` is the sentence to show. */
export type TenderRequirementHighlight = { code: TenderRequirementHighlightCode; label: string };

export type TenderHighlights = { requirements: TenderRequirementHighlight[] };

/**
 * `GET /api/v1/me/tender-highlights?tenderIds=…` (session + access, ≤ 100 ids). Read only: tenders without a ready
 * sheet or without a highlighted requirement are absent from `results`.
 */
export type TenderHighlightsResponse = { results: Record<string, TenderHighlights> };

export type OpportunityStatus = 'open' | 'upcoming' | 'closed' | 'undated';

export type OpportunityProgram = 'audiovisual' | 'lpg' | 'fac' | 'fsa';
export type OpportunityKind = 'culture' | 'funding' | 'innovation' | 'partnership' | 'procurement';
export type OpportunitySource = 'mapas' | 'finep' | 'cnpq' | 'capes' | 'transferegov' | 'funarte' | 'minc' | 'salic' | 'worldbank' | 'eu_ft' | 'idb';
/** Reach of a call, not its nature: an international call still has a `kind`. */
export type OpportunityScope = 'national' | 'international';
export type InternationalRegion = 'america-latina' | 'africa' | 'europa' | 'asia' | 'oriente-medio' | 'global';
/** Whether an entity or person from Brazil can take part (or be funded). Indicative: the official notice prevails. */
export type BrazilEligibility = 'yes' | 'conditional' | 'no' | 'unknown';
/** Canonical cultural areas (docs/contracts/opportunities-v1.md). */
export type OpportunityArea =
  | 'audiovisual'
  | 'musica'
  | 'teatro'
  | 'danca'
  | 'circo'
  | 'artes-visuais'
  | 'literatura'
  | 'patrimonio'
  | 'culturas-populares'
  | 'artesanato'
  | 'cultura-digital'
  | 'gastronomia'
  | 'gestao-producao'
  | 'formacao'
  | 'diversidade'
  | 'outras';

export type OpportunitySearchParams = {
  q?: string;
  state?: string[];
  installation?: string[];
  status?: OpportunityStatus[];
  program?: OpportunityProgram[];
  kind?: OpportunityKind[];
  source?: OpportunitySource[];
  area?: OpportunityArea[];
  /** Municipality names. The UI sends the UF in `state` along with it. */
  city?: string[];
  /** Publishing institution names, exactly as listed in the `organization` facet. */
  organization?: string[];
  deadlineFrom?: string;
  deadlineTo?: string;
  /** Also list what a person published with no sign of a public call (classes, private workshops). */
  includeIndividual?: boolean;
  /** Absent means national calls only. */
  scope?: OpportunityScope;
  /** Funding body, exactly as listed in the `agency` facet. */
  agency?: string[];
  region?: InternationalRegion[];
  /** ISO 3166-1 alpha-2 of the country where the call is executed. */
  country?: string[];
  /** Language code of the notice at the source (`en`, `fr`…). */
  language?: string[];
  /** Type of the call at the source, exactly as listed in the `opportunityType` facet. */
  opportunityType?: string[];
  /** In the international tab an absent value means "open or conditional"; `'all'` lifts the filter and is never sent to the API. */
  eligibility?: BrazilEligibility[] | 'all';
  funding?: BrazilEligibility[];
  page?: number;
  pageSize?: number;
  facets?: boolean;
};

export type OpportunityEligibilityAnswer = { status: BrazilEligibility; label: string; reason: string | null };

/** What an international call adds to the summary (docs/contracts/opportunities-v1.md). */
export type InternationalOpportunity = {
  agency: string | null;
  country: string | null;
  countryName: string | null;
  region: InternationalRegion | null;
  regionName: string | null;
  /** The project is executed in Brazil. */
  brazilProject: boolean;
  language: string | null;
  languageName: string | null;
  titleOriginal: string | null;
  titlePt: string | null;
  /** `source`: published in Portuguese by the source. `model`: automatic translation by a local model. */
  translationSource: 'source' | 'model' | null;
  amountOriginal: number | null;
  currency: string | null;
  /** `amountOriginal` at the PTAX rate of `fxDate`. An approximation. */
  amountBrlApprox: number | null;
  fxRate: number | null;
  fxDate: string | null;
  deadline: {
    at: string | null;
    /** With `date` only the day is known: an hour in `original` was not converted. */
    precision: 'datetime' | 'date' | null;
    timeZone: string | null;
    /** As the source wrote it, in its own wall clock: `2026-10-27 11:00` or `2026-10-27`. */
    original: string | null;
  };
  brazilEligibility: (OpportunityEligibilityAnswer & { rule: string | null }) | null;
  /** Separate from being allowed to take part. `null` where it does not apply (procurement). */
  brazilFunding: OpportunityEligibilityAnswer | null;
  eligibilityCheckedAt: string | null;
  details: { label: string; value: string }[];
};

export type OpportunitySummary = {
  id: string;
  title: string;
  summary: string | null;
  organizationName: string;
  status: OpportunityStatus;
  program: OpportunityProgram | null;
  kind: OpportunityKind;
  source: OpportunitySource;
  sourceName: string;
  audience: string | null;
  amount: number | null;
  documents: { title: string; url: string; mediaType: string | null }[];
  registrationFrom: string | null;
  registrationTo: string | null;
  state: string | null;
  /** Municipality, for calls collected from a municipal source. */
  city: string | null;
  /** No closing date: the call takes registrations continuously. */
  continuousFlow: boolean;
  areas: OpportunityArea[];
  /** Area terms as the source published them. */
  areaTerms: string[];
  /** Source type of the call: "Edital", "Oficina", "Festival"… */
  opportunityType: string | null;
  /** Project or programme the call belongs to at the source. */
  originName: string | null;
  /** Published by a person, with no sign of a public call. Listed only with `includeIndividual`. */
  individualListing: boolean;
  installation: { id: string; name: string; uf: string; city: string | null };
  sourceUrl: string | null;
  updatedAt: string;
  profileMatch: { score: number; reasons: string[] } | null;
  scope: OpportunityScope;
  /** Set on international calls only. */
  international: InternationalOpportunity | null;
  /** Where to apply, read without AI from the call page or its documents. Absent from older API versions. */
  application?: OpportunityApplication | null;
  /** Last reading of the call page and documents; `null` while never read. */
  applicationCheckedAt?: string | null;
  /** Registration period read from the notice, only when the source publishes no dates. */
  noticeDates?: OpportunityNoticeDates | null;
};

/** `source_page`: the call page at the source (or the page is the platform). `document`: one of its documents. */
export type OpportunityNoticeOrigin = 'source_page' | 'document';

export type OpportunityApplication = {
  url: string;
  /** Slug of a known platform; `null` for a link accepted by the words around it in the notice. */
  platform: string | null;
  label: string | null;
  /** Definite article of `label`: "na Plataforma Sucupira", "no Salic". */
  article: 'a' | 'o' | null;
  origin: OpportunityNoticeOrigin;
  documentTitle: string | null;
};

export type OpportunityNoticeDates = {
  registrationFrom: string | null;
  registrationTo: string | null;
  origin: OpportunityNoticeOrigin;
  documentTitle: string | null;
};

export type OpportunityCityBucket = FacetBucket & { state: string | null };

export type OpportunitySearchResponse = {
  data: OpportunitySummary[];
  pagination: Pagination;
  facets: {
    status: FacetBucket[];
    state: FacetBucket[];
    installation: FacetBucket[];
    program: FacetBucket[];
    kind: FacetBucket[];
    source: FacetBucket[];
    /** A call counts once in each of its areas. */
    area: FacetBucket[];
    city: OpportunityCityBucket[];
    organization: FacetBucket[];
    /** Empty unless the search includes international calls. */
    agency: FacetBucket[];
    region: FacetBucket[];
    language: FacetBucket[];
    opportunityType: FacetBucket[];
    eligibility: FacetBucket[];
    funding: FacetBucket[];
  } | null;
  meta: {
    query: string | null;
    tookMs: number;
    indexUpdatedAt: string | null;
    installationIssues: { installationId: string; name: string; message: string }[];
    gaps: { uf: string; name: string }[];
    /** Individual listings the same filters would add with `includeIndividual`. */
    hiddenIndividualListings: number;
    scope: OpportunityScope | 'all';
    /** The account preference "Mostrar oportunidades internacionais". */
    internationalInProfile: boolean;
  };
};

export type RecommendationDismissReason = 'not_offering' | 'region' | 'value' | 'deadline';
