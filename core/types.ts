export type Actor = "human" | "agent" | "system";

export type ClaimStatus =
  | "ai_proposed"
  | "human_confirmed"
  | "human_revised"
  | "contested"
  | "evidence_insufficient"
  | "final";

/** V0.1 agent status — retained for UI compatibility during migration. */
export type AgentStatus =
  | "idle"
  | "working"
  | "waiting_for_human"
  | "blocked"
  | "completed";

// ── V0.2 Versioned Metadata ──────────────────────────────────────────────

export type VersionedMetadata = {
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  updatedBy: Actor;
};

// ── Core Domain Objects ──────────────────────────────────────────────────

export type ResearchTask = {
  id: string;
  title: string;
  question: string;
  scope: string;
  sourceMode: "demo_corpus" | "live_search";
  createdAt: string;
};

export type Source = VersionedMetadata & {
  id: string;
  title: string;
  publisher: string;
  url?: string;
  publishedAt?: string;
  summary: string;
  /** V0.1 compatibility — new logic uses createdBy. */
  addedBy: Actor;
  // ── Reserved V0.2 fields (no business semantics in Phase 1) ──
  fileName?: string;
  mediaType?: string;
  content?: string;
  contentHash?: string;
  lineCount?: number;
};

export type EvidencePolarity = "supporting" | "counter" | "context";

export type Evidence = VersionedMetadata & {
  id: string;
  sourceId: string;
  quoteOrFinding: string;
  relevance: string;
  /** V0.1 compatibility — new logic uses createdBy. */
  addedBy: Actor;
  // ── Reserved V0.2 fields (no business semantics in Phase 1) ──
  sourceVersion?: number;
  sourceContentHash?: string;
  section?: string;
  startLine?: number;
  endLine?: number;
  polarity?: EvidencePolarity;
};

export type ResearchNote = VersionedMetadata & {
  id: string;
  content: string;
  sourceIds: string[];
  evidenceIds: string[];
};

export type Claim = VersionedMetadata & {
  id: string;
  statement: string;
  reasoning: string;
  supportingEvidenceIds: string[];
  counterEvidenceIds: string[];
  confidence?: number;
  status: ClaimStatus;
  humanDecisionNote?: string;
  lastHumanReviewedAt?: string;
};

export type BriefDerivation = {
  claimVersions: Record<string, number>;
  evidenceVersions: Record<string, number>;
  generatedFromEventIds: string[];
  generatedAt: string;
  generatedBy: Actor;
};

export type Brief = VersionedMetadata & {
  markdown: string;
  derivation?: BriefDerivation;
};

// ── V0.2 Human Messages & Agent Control ──────────────────────────────────

export type HumanInputRequest = {
  id: string;
  question: string;
  relatedObjectIds: string[];
  status: "open" | "answered";
  answer?: string;
  createdAt: string;
  answeredAt?: string;
};

export type HumanTeammateMessage = {
  id: string;
  content: string;
  relatedObjectIds: string[];
  createdAt: string;
  acknowledgedByAgentAt?: string;
  acknowledgedInTurnId?: string;
};

export type TeammateMessageStatus =
  | "pending"
  | "read"
  | "resolved"
  | "blocked";

export type TeammateMessage = {
  id: string;
  actor: "human" | "agent";
  content: string;
  relatedObjectIds: string[];
  createdAt: string;
  status: TeammateMessageStatus;
  inReplyToMessageId?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolvedByActionIds?: string[];
};

export type AgentRunStatus =
  | "idle"
  | "running"
  | "applying"
  | "paused"
  | "waiting_for_human"
  | "completed"
  | "error";

export type AgentControl = {
  status: AgentRunStatus;
  currentGoal?: string;
  latestActionSummary?: string;
  activeRunId?: string;
  activeStepId?: string;
  lastCompletedStepId?: string;
  stepCountInRun: number;
  maxStepsPerRun: number;
  maxActionsPerStep: number;
  acknowledgedHumanEventIds: string[];
  discardedStaleRunResponseCount: number;
  error?: string;
  mode: "idle" | "mock" | "real" | "fallback";
};

// ── V0.2 Slim Events ─────────────────────────────────────────────────────

export type WorkspaceObjectType =
  | "task"
  | "source"
  | "evidence"
  | "note"
  | "claim"
  | "brief"
  | "human_request"
  | "human_message"
  | "agent_control";

export type EventChange = {
  field: string;
  before?: unknown;
  after?: unknown;
};

export type WorkspaceEvent = {
  id: string;
  timestamp: string;
  actor: Actor;
  actionType: string;
  objectType?: WorkspaceObjectType;
  objectId?: string;
  summary: string;
  reason?: string;
  // ── V0.2 slim event fields ──
  actionId?: string;
  runId?: string;
  stepId?: string;
  objectVersionBefore?: number;
  objectVersionAfter?: number;
  expectedVersion?: number;
  changes?: EventChange[];
  rejectionCode?: ActionRejectionCode;
  // ── V0.1 compatibility: full before/after moved to legacy fields ──
  legacyBefore?: unknown;
  legacyAfter?: unknown;
  /** @deprecated Use legacyBefore / changes instead. */
  before?: unknown;
  /** @deprecated Use legacyAfter / changes instead. */
  after?: unknown;
};

// ── V0.2 Action Protocol ─────────────────────────────────────────────────

export type ActionRejectionCode =
  | "PERMISSION_DENIED"
  | "OBJECT_NOT_FOUND"
  | "INVALID_REFERENCE"
  | "STALE_OBJECT_VERSION"
  | "INVALID_ACTION"
  | "CONTENT_IMMUTABLE"
  | "LINE_RANGE_INVALID"
  | "AGENT_STATE_REGRESSION"
  | "BRIEF_CLAIM_UNREVIEWED"
  | "DUPLICATE_SOURCE";

export type ActionApplyResult = {
  actionId: string;
  accepted: boolean;
  eventId: string;
  objectType?: WorkspaceObjectType;
  objectId?: string;
  expectedVersion?: number;
  beforeVersion?: number;
  afterVersion?: number;
  rejectionCode?: ActionRejectionCode;
};

// ── Workspace State ──────────────────────────────────────────────────────

export type WorkspaceState = {
  schemaVersion: 2;
  task: ResearchTask;
  sources: Source[];
  evidence: Evidence[];
  notes: ResearchNote[];
  claims: Claim[];
  brief: Brief;
  messages?: TeammateMessage[];
  /** V0.1/V0.2 compatibility only; new writes use messages. */
  humanMessages?: HumanTeammateMessage[];
  events: WorkspaceEvent[];
  /** V0.1 agentStatus — retained for UI compatibility during migration. */
  agentStatus: AgentStatus;
  agentControl: AgentControl;
  pendingHumanRequest?: HumanInputRequest;
  completed: boolean;
};
