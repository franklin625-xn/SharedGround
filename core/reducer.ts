import { createWorkspaceEvent } from "@/core/event-factory";
import { canApplyWorkspaceAction } from "@/core/permissions";
import type { WorkspaceAction } from "@/core/schemas";
import type {
  ActionApplyResult,
  ActionRejectionCode,
  Actor,
  Claim,
  ClaimStatus,
  Evidence,
  EventChange,
  HumanInputRequest,
  HumanTeammateMessage,
  ResearchNote,
  Source,
  TeammateMessage,
  WorkspaceObjectType,
  WorkspaceState,
} from "@/core/types";

export function resetObjectCounterForTests() {
  // Kept for backward compatibility — object IDs now derive from state.
}

function now() {
  return new Date().toISOString();
}

/** Backfill V0.2 version fields onto a V0.1 object. Idempotent. */
function enrichVersioned<T extends { version?: number; createdAt?: string; updatedAt?: string; createdBy?: Actor; updatedBy?: Actor; addedBy?: Actor }>(
  obj: T,
): T {
  const ts = obj.createdAt ?? now();
  return {
    ...obj,
    version: obj.version ?? 1,
    createdAt: obj.createdAt ?? ts,
    updatedAt: obj.updatedAt ?? ts,
    createdBy: obj.createdBy ?? obj.addedBy ?? "system",
    updatedBy: obj.updatedBy ?? obj.addedBy ?? "system",
  };
}

function withV02Defaults(state: WorkspaceState): WorkspaceState {
  const enrichedSources = state.sources.map((s) => enrichVersioned(s));
  const enrichedEvidence = state.evidence.map((e) => enrichVersioned(e));
  const enrichedNotes = state.notes.map((n) => enrichVersioned(n));
  const enrichedClaims = state.claims.map((c) => enrichVersioned(c));
  const enrichedBrief = enrichVersioned(state.brief);
  const legacyMessages = (state.humanMessages ?? []).map(
    (message): TeammateMessage => ({
      id: message.id,
      actor: "human",
      content: message.content,
      relatedObjectIds: message.relatedObjectIds,
      createdAt: message.createdAt,
      status: message.acknowledgedByAgentAt ? "read" : "pending",
      acknowledgedAt: message.acknowledgedByAgentAt,
    }),
  );

  return {
    ...state,
    schemaVersion: 2,
    sources: enrichedSources,
    evidence: enrichedEvidence,
    notes: enrichedNotes,
    claims: enrichedClaims,
    brief: enrichedBrief,
    messages: state.messages ?? legacyMessages,
    humanMessages: state.humanMessages ?? [],
    agentControl: state.agentControl ?? {
      status: mapAgentStatusToRunStatus(state.agentStatus),
      stepCountInRun: 0,
      maxStepsPerRun: 12,
      maxActionsPerStep: 3,
      acknowledgedHumanEventIds: [],
      discardedStaleRunResponseCount: 0,
      mode: "idle",
    },
  };
}

function mapAgentStatusToRunStatus(
  s: WorkspaceState["agentStatus"],
): WorkspaceState["agentControl"]["status"] {
  switch (s) {
    case "idle": return "idle";
    case "working": return "running";
    case "waiting_for_human": return "waiting_for_human";
    case "blocked": return "paused";
    case "completed": return "completed";
  }
}

function createId(prefix: string, state: WorkspaceState): string {
  const allIds = [
    ...state.sources.map((s) => s.id),
    ...state.evidence.map((e) => e.id),
    ...state.notes.map((n) => n.id),
    ...state.claims.map((c) => c.id),
    ...(state.pendingHumanRequest ? [state.pendingHumanRequest.id] : []),
    ...(state.messages ?? []).map((m) => m.id),
    ...(state.humanMessages ?? []).map((m) => m.id),
  ];

  const prefixPattern = new RegExp(`^${prefix}-(\\d+)$`);
  let maxCounter = 0;

  for (const id of allIds) {
    const match = id.match(prefixPattern);
    if (match) {
      const num = parseInt(match[1]!, 10);
      if (num > maxCounter) maxCounter = num;
    }
  }

  return `${prefix}-${(maxCounter + 1).toString().padStart(4, "0")}`;
}

function hasSource(state: WorkspaceState, sourceId: string): boolean {
  return state.sources.some((source) => source.id === sourceId);
}

function hasEvidence(state: WorkspaceState, evidenceId: string): boolean {
  return state.evidence.some((evidence) => evidence.id === evidenceId);
}

function findMissingId(
  ids: string[] | undefined,
  exists: (id: string) => boolean,
): string | undefined {
  return ids?.find((id) => !exists(id));
}

function hasWorkspaceObject(state: WorkspaceState, objectId: string): boolean {
  return (
    state.task.id === objectId ||
    objectId === "brief" ||
    hasSource(state, objectId) ||
    hasEvidence(state, objectId) ||
    state.notes.some((note) => note.id === objectId) ||
    state.claims.some((claim) => claim.id === objectId) ||
    state.pendingHumanRequest?.id === objectId ||
    (state.messages ?? []).some((m) => m.id === objectId) ||
    (state.humanMessages ?? []).some((m) => m.id === objectId)
  );
}

// ── Content helpers ──────────────────────────────────────────────────────

/** Simple FNV-1a hash for content integrity. */
function hashContent(content: string): string {
  let h = 2166136261;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function countLines(content: string): number {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

// ── Version helpers ──────────────────────────────────────────────────────

interface VersionedLike {
  version?: number;
}

function currentVersion(obj: VersionedLike | undefined): number {
  return obj?.version ?? 0;
}

function nextVersion(obj: VersionedLike | undefined): number {
  return currentVersion(obj) + 1;
}

function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  skipKeys: Set<string> = new Set(),
): EventChange[] {
  const changes: EventChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    if (skipKeys.has(key)) continue;
    const b = before[key];
    const a = after[key];
    if (typeof b === "object" && b !== null) continue;
    if (typeof a === "object" && a !== null) continue;
    if (b !== a) {
      changes.push({ field: key, before: b, after: a });
    }
  }
  return changes;
}

// ── expectedVersion check ────────────────────────────────────────────────

interface VersionedObj {
  id?: string;
  version: number;
}

function checkExpectedVersion(
  actor: Actor,
  expectedVersion: number | undefined,
  current: VersionedObj | undefined,
): ActionRejectionCode | undefined {
  if (actor !== "agent") return undefined;
  if (expectedVersion === undefined) return "INVALID_ACTION";
  if (!current) return undefined;
  if (expectedVersion !== current.version) return "STALE_OBJECT_VERSION";
  return undefined;
}

// ── Claim status regression check ────────────────────────────────────────

const humanReviewedStatuses: ClaimStatus[] = [
  "human_confirmed",
  "human_revised",
  "contested",
  "evidence_insufficient",
  "final",
];

function isAgentClaimRegression(
  actor: Actor,
  before: Claim,
  requestedStatus: ClaimStatus | undefined,
): boolean {
  if (actor !== "agent") return false;
  if (requestedStatus === undefined) return false;
  if (requestedStatus !== "ai_proposed") return false;
  return humanReviewedStatuses.includes(before.status);
}

// ── actionId generator ───────────────────────────────────────────────────

function makeActionId(action: WorkspaceAction, state: WorkspaceState): string {
  return (
    action.actionId ??
    `action-${(state.events.length + 1).toString().padStart(4, "0")}`
  );
}

// ── applyWorkspaceActionWithResult — V0.2 ────────────────────────────────

export function applyWorkspaceActionWithResult(
  state: WorkspaceState,
  action: WorkspaceAction,
  actor: Actor,
): { state: WorkspaceState; result: ActionApplyResult } {
  const enriched = withV02Defaults(state);
  const actionId = makeActionId(action, enriched);
  const permission = canApplyWorkspaceAction(actor, action);

  function accepted(
    eventId: string,
    opts?: {
      objectType?: WorkspaceObjectType;
      objectId?: string;
      expectedVersion?: number;
      beforeVersion?: number;
      afterVersion?: number;
    },
  ): ActionApplyResult {
    return {
      actionId,
      accepted: true,
      eventId,
      objectType: opts?.objectType,
      objectId: opts?.objectId,
      expectedVersion: opts?.expectedVersion,
      beforeVersion: opts?.beforeVersion,
      afterVersion: opts?.afterVersion,
    };
  }

  function rejected(
    code: ActionRejectionCode,
    opts?: {
      objectType?: WorkspaceObjectType;
      objectId?: string;
      expectedVersion?: number;
      beforeVersion?: number;
    },
  ): ActionApplyResult {
    return {
      actionId,
      accepted: false,
      eventId: "",
      objectType: opts?.objectType,
      objectId: opts?.objectId,
      expectedVersion: opts?.expectedVersion,
      beforeVersion: opts?.beforeVersion,
      afterVersion: opts?.beforeVersion,
      rejectionCode: code,
    };
  }

  // ── Permission gate ──

  if (!permission.allowed) {
    const next = withV02Defaults({
      ...enriched,
      events: [
        ...enriched.events,
        createWorkspaceEvent(
          {
            actor,
            actionType: "ACTION_REJECTED",
            actionId,
            summary: permission.reason ?? `Action ${action.type} was rejected.`,
            reason: action.reason,
            rejectionCode: "PERMISSION_DENIED",
          },
          enriched.events.length,
        ),
      ],
    });
    return {
      state: next,
      result: rejected("PERMISSION_DENIED"),
    };
  }

  // ── Action dispatch ──

  switch (action.type) {
    case "SEARCH_SOURCE": {
      const next = appendEvent(
        enriched,
        actor,
        action.type,
        "Search source requested.",
        undefined,
        undefined,
        action.reason,
        { actionId },
      );
      return {
        state: next,
        result: accepted(next.events.at(-1)!.id),
      };
    }

    case "ADD_SOURCE": {
      const timestamp = now();
      const content = action.payload.content ?? "";
      const contentHash = content ? hashContent(content) : undefined;
      if (contentHash) {
        const duplicate = enriched.sources.find(
          (source) => source.contentHash === contentHash,
        );
        if (duplicate) {
          const next = appendRejectionEvent(
            enriched,
            actor,
            action.type,
            actionId,
            "This file is identical to an existing source.",
            "source",
            duplicate.id,
            action.reason,
            "DUPLICATE_SOURCE",
          );
          return {
            state: next,
            result: rejected("DUPLICATE_SOURCE", {
              objectType: "source",
              objectId: duplicate.id,
              beforeVersion: duplicate.version,
            }),
          };
        }
      }
      const source: Source = {
        id: createId("source", enriched),
        title: action.payload.title,
        publisher: action.payload.publisher,
        url: action.payload.url,
        publishedAt: action.payload.publishedAt,
        summary: action.payload.summary,
        addedBy: actor,
        createdAt: timestamp,
        version: 1,
        updatedAt: timestamp,
        createdBy: actor,
        updatedBy: actor,
        fileName: action.payload.fileName,
        mediaType: action.payload.mediaType ?? (content ? "markdown" : "demo"),
        content: content || undefined,
        contentHash,
        lineCount: content ? countLines(content) : undefined,
      };
      const next = { ...enriched, sources: [...enriched.sources, source] };
      const final = appendEvent(
        next,
        actor,
        action.type,
        `Added source: ${source.title}`,
        "source",
        source.id,
        action.reason,
        undefined,
        undefined,
        { objectVersionAfter: 1, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "source",
          objectId: source.id,
          afterVersion: 1,
        }),
      };
    }

    case "EDIT_SOURCE": {
      const before = enriched.sources.find(
        (source) => source.id === action.payload.sourceId,
      );
      if (!before) {
        const next = rejectMissingObject(
          enriched, actor, action.type, action.payload.sourceId, action.reason, actionId,
        );
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "source", objectId: action.payload.sourceId }) };
      }

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "source", before, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "source", objectId: before.id, expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const after: Source = {
        ...before,
        title: action.payload.title,
        publisher: action.payload.publisher,
        url: action.payload.url,
        publishedAt: action.payload.publishedAt,
        summary: action.payload.summary,
        updatedAt: timestamp,
        version: newVersion,
        updatedBy: actor,
      };
      const next = {
        ...enriched,
        sources: enriched.sources.map((source) =>
          source.id === after.id ? after : source,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, `Edited source: ${after.title}`,
        "source", after.id, action.reason,
        before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "source", objectId: after.id,
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "ADD_EVIDENCE": {
      const source = enriched.sources.find((s) => s.id === action.payload.sourceId);
      if (!source) {
        const next = rejectMissingObject(
          enriched, actor, action.type, action.payload.sourceId, action.reason, actionId,
        );
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "evidence", objectId: action.payload.sourceId }) };
      }

      // Line range validation
      if (action.payload.startLine !== undefined || action.payload.endLine !== undefined) {
        if (
          action.payload.startLine === undefined ||
          action.payload.endLine === undefined
        ) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            "Evidence line range requires both startLine and endLine.",
            "evidence", undefined, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence" }) };
        }

        if (action.payload.startLine > action.payload.endLine) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            `Evidence startLine (${action.payload.startLine}) must be <= endLine (${action.payload.endLine}).`,
            "evidence", undefined, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence" }) };
        }

        const srcLines = source.lineCount ?? (source.content ? countLines(source.content) : 0);
        if (action.payload.endLine > srcLines) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            `Evidence endLine (${action.payload.endLine}) exceeds source line count (${srcLines}).`,
            "evidence", undefined, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence" }) };
        }
      }

      const timestamp = now();
      const evidence: Evidence = {
        id: createId("evidence", enriched),
        sourceId: action.payload.sourceId,
        quoteOrFinding: action.payload.quoteOrFinding,
        relevance: action.payload.relevance,
        addedBy: actor,
        createdAt: timestamp,
        version: 1,
        updatedAt: timestamp,
        createdBy: actor,
        updatedBy: actor,
        sourceVersion: source.version,
        sourceContentHash: source.contentHash,
        section: action.payload.section,
        startLine: action.payload.startLine,
        endLine: action.payload.endLine,
        polarity: action.payload.polarity ?? "context",
      };
      const next = { ...enriched, evidence: [...enriched.evidence, evidence] };
      const final = appendEvent(
        next, actor, action.type, "Added evidence.", "evidence", evidence.id, action.reason,
        undefined, evidence, { objectVersionAfter: 1, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "evidence", objectId: evidence.id, afterVersion: 1 }),
      };
    }

    case "EDIT_EVIDENCE": {
      const before = enriched.evidence.find(
        (evidence) => evidence.id === action.payload.evidenceId,
      );
      if (!before) {
        const next = rejectMissingObject(
          enriched, actor, action.type, action.payload.evidenceId, action.reason, actionId,
        );
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "evidence", objectId: action.payload.evidenceId }) };
      }

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "evidence", before, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "evidence", objectId: before.id, expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      // Resolve source for line-range validation
      const evidenceSource = enriched.sources.find((s) => s.id === before.sourceId);
      const srcLines = evidenceSource?.lineCount ??
        (evidenceSource?.content ? countLines(evidenceSource.content) : 0);

      if (action.payload.startLine !== undefined || action.payload.endLine !== undefined) {
        if (
          action.payload.startLine === undefined ||
          action.payload.endLine === undefined
        ) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            "Evidence line range requires both startLine and endLine.",
            "evidence", before.id, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence", objectId: before.id }) };
        }

        if (action.payload.startLine > action.payload.endLine) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            `Evidence startLine (${action.payload.startLine}) must be <= endLine (${action.payload.endLine}).`,
            "evidence", before.id, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence", objectId: before.id }) };
        }

        if (action.payload.endLine > srcLines) {
          const next = appendRejectionEvent(
            enriched, actor, action.type, actionId,
            `Evidence endLine (${action.payload.endLine}) exceeds source line count (${srcLines}).`,
            "evidence", before.id, action.reason, "LINE_RANGE_INVALID",
          );
          return { state: next, result: rejected("LINE_RANGE_INVALID", { objectType: "evidence", objectId: before.id }) };
        }
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const after: Evidence = {
        ...before,
        quoteOrFinding: action.payload.quoteOrFinding,
        relevance: action.payload.relevance,
        updatedAt: timestamp,
        version: newVersion,
        updatedBy: actor,
        sourceVersion: evidenceSource?.version ?? before.sourceVersion,
        sourceContentHash: evidenceSource?.contentHash ?? before.sourceContentHash,
        section: action.payload.section ?? before.section,
        startLine: action.payload.startLine ?? before.startLine,
        endLine: action.payload.endLine ?? before.endLine,
        polarity: action.payload.polarity ?? before.polarity,
      };
      const next = {
        ...enriched,
        evidence: enriched.evidence.map((evidence) =>
          evidence.id === after.id ? after : evidence,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, "Edited evidence.", "evidence", after.id, action.reason,
        before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "evidence", objectId: after.id,
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "ADD_NOTE": {
      const missingSourceId = findMissingId(action.payload.sourceIds, (id) =>
        hasSource(enriched, id),
      );
      if (missingSourceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingSourceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "note", objectId: missingSourceId }) };
      }

      const missingEvidenceId = findMissingId(action.payload.evidenceIds, (id) =>
        hasEvidence(enriched, id),
      );
      if (missingEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "note", objectId: missingEvidenceId }) };
      }

      const timestamp = now();
      const note: ResearchNote = {
        id: createId("note", enriched),
        content: action.payload.content,
        sourceIds: action.payload.sourceIds,
        evidenceIds: action.payload.evidenceIds,
        createdBy: actor,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
        updatedBy: actor,
      };
      const next = { ...enriched, notes: [...enriched.notes, note] };
      const final = appendEvent(
        next, actor, action.type, "Added research note.", "note", note.id, action.reason,
        undefined, note, { objectVersionAfter: 1, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "note", objectId: note.id, afterVersion: 1 }),
      };
    }

    case "EDIT_NOTE": {
      const before = enriched.notes.find(
        (note) => note.id === action.payload.noteId,
      );
      if (!before) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.noteId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "note", objectId: action.payload.noteId }) };
      }

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "note", before, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "note", objectId: before.id, expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      const missingSourceId = findMissingId(action.payload.sourceIds, (id) =>
        hasSource(enriched, id),
      );
      if (missingSourceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingSourceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "note", objectId: missingSourceId }) };
      }

      const missingEvidenceId = findMissingId(action.payload.evidenceIds, (id) =>
        hasEvidence(enriched, id),
      );
      if (missingEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "note", objectId: missingEvidenceId }) };
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const after: ResearchNote = {
        ...before,
        content: action.payload.content,
        sourceIds: action.payload.sourceIds,
        evidenceIds: action.payload.evidenceIds,
        updatedAt: timestamp,
        version: newVersion,
        updatedBy: actor,
      };
      const next = {
        ...enriched,
        notes: enriched.notes.map((note) => (note.id === after.id ? after : note)),
      };
      const final = appendEvent(
        next, actor, action.type, "Edited research note.", "note", after.id, action.reason,
        before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "note", objectId: after.id,
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "PROPOSE_CLAIM": {
      const missingSupportingEvidenceId = findMissingId(
        action.payload.supportingEvidenceIds,
        (id) => hasEvidence(enriched, id),
      );
      if (missingSupportingEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingSupportingEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "claim", objectId: missingSupportingEvidenceId }) };
      }

      const missingCounterEvidenceId = findMissingId(
        action.payload.counterEvidenceIds,
        (id) => hasEvidence(enriched, id),
      );
      if (missingCounterEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingCounterEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "claim", objectId: missingCounterEvidenceId }) };
      }

      const timestamp = now();
      const claim: Claim = {
        id: createId("claim", enriched),
        statement: action.payload.statement,
        reasoning: action.payload.reasoning,
        supportingEvidenceIds: action.payload.supportingEvidenceIds,
        counterEvidenceIds: action.payload.counterEvidenceIds,
        confidence: action.payload.confidence,
        status: "ai_proposed",
        createdBy: actor,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
        updatedBy: actor,
      };
      const next = { ...enriched, claims: [...enriched.claims, claim] };
      const final = appendEvent(
        next, actor, action.type, "Proposed claim.", "claim", claim.id, action.reason,
        undefined, claim, { objectVersionAfter: 1, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "claim", objectId: claim.id, afterVersion: 1 }),
      };
    }

    case "UPDATE_CLAIM": {
      const before = enriched.claims.find(
        (claim) => claim.id === action.payload.claimId,
      );
      if (!before) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.claimId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "claim", objectId: action.payload.claimId }) };
      }

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "claim", before, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "claim", objectId: before.id, expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      // AGENT_STATE_REGRESSION check
      if (isAgentClaimRegression(actor, before, action.payload.status)) {
        const next = appendRejectionEvent(
          enriched, actor, action.type, actionId,
          `Agent cannot move a human-reviewed claim (${before.status}) back to ai_proposed.`,
          "claim", before.id, action.reason, "AGENT_STATE_REGRESSION",
        );
        return { state: next, result: rejected("AGENT_STATE_REGRESSION", { objectType: "claim", objectId: before.id, beforeVersion: before.version }) };
      }

      const missingSupportingEvidenceId = findMissingId(
        action.payload.supportingEvidenceIds,
        (id) => hasEvidence(enriched, id),
      );
      if (missingSupportingEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingSupportingEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "claim", objectId: missingSupportingEvidenceId }) };
      }

      const missingCounterEvidenceId = findMissingId(
        action.payload.counterEvidenceIds,
        (id) => hasEvidence(enriched, id),
      );
      if (missingCounterEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingCounterEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "claim", objectId: missingCounterEvidenceId }) };
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const newStatus = action.payload.status ?? before.status;
      const isHumanReview = actor === "human" && newStatus !== before.status;
      const after: Claim = {
        ...before,
        statement: action.payload.statement ?? before.statement,
        reasoning: action.payload.reasoning ?? before.reasoning,
        supportingEvidenceIds:
          action.payload.supportingEvidenceIds ?? before.supportingEvidenceIds,
        counterEvidenceIds:
          action.payload.counterEvidenceIds ?? before.counterEvidenceIds,
        confidence: action.payload.confidence ?? before.confidence,
        status: newStatus,
        humanDecisionNote:
          action.payload.humanDecisionNote ?? before.humanDecisionNote,
        updatedAt: timestamp,
        version: newVersion,
        updatedBy: actor,
        lastHumanReviewedAt: isHumanReview
          ? timestamp
          : before.lastHumanReviewedAt,
      };
      const next = {
        ...enriched,
        claims: enriched.claims.map((claim) =>
          claim.id === after.id ? after : claim,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, `Updated claim status to ${after.status}.`,
        "claim", after.id, action.reason, before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "claim", objectId: after.id,
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "CHALLENGE_CLAIM": {
      const before = enriched.claims.find(
        (claim) => claim.id === action.payload.claimId,
      );
      if (!before) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.claimId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "claim", objectId: action.payload.claimId }) };
      }

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "claim", before, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "claim", objectId: before.id, expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      const missingCounterEvidenceId = findMissingId(
        action.payload.counterEvidenceIds,
        (id) => hasEvidence(enriched, id),
      );
      if (missingCounterEvidenceId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingCounterEvidenceId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "claim", objectId: missingCounterEvidenceId }) };
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const after: Claim = {
        ...before,
        counterEvidenceIds: action.payload.counterEvidenceIds,
        status: "contested",
        humanDecisionNote: action.payload.note,
        updatedAt: timestamp,
        version: newVersion,
        updatedBy: actor,
        lastHumanReviewedAt: timestamp,
      };
      const next = {
        ...enriched,
        claims: enriched.claims.map((claim) =>
          claim.id === after.id ? after : claim,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, "Challenged claim.", "claim", after.id, action.reason,
        before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "claim", objectId: after.id,
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "REQUEST_HUMAN_INPUT": {
      const missingRelatedObjectId = findMissingId(
        action.payload.relatedObjectIds,
        (id) => hasWorkspaceObject(enriched, id),
      );
      if (missingRelatedObjectId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingRelatedObjectId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "human_request", objectId: missingRelatedObjectId }) };
      }

      const request: HumanInputRequest = {
        id: createId("request", enriched),
        question: action.payload.question,
        relatedObjectIds: action.payload.relatedObjectIds,
        status: "open",
        createdAt: now(),
      };
      const next = {
        ...enriched,
        pendingHumanRequest: request,
        agentStatus: "waiting_for_human" as const,
        agentControl: {
          ...enriched.agentControl,
          status: "waiting_for_human" as const,
        },
      };
      const final = appendEvent(
        next, actor, action.type, "Agent requested human input.", "human_request",
        request.id, action.reason, undefined, request,
        { objectVersionAfter: 1, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "human_request", objectId: request.id }),
      };
    }

    case "ANSWER_HUMAN_INPUT": {
      const before = enriched.pendingHumanRequest;
      if (!before || before.id !== action.payload.requestId) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.requestId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "human_request", objectId: action.payload.requestId }) };
      }

      const after: HumanInputRequest = {
        ...before,
        status: "answered",
        answer: action.payload.answer,
        answeredAt: now(),
      };
      const next = {
        ...enriched,
        pendingHumanRequest: after,
        agentStatus: "idle" as const,
        agentControl: {
          ...enriched.agentControl,
          status: "idle" as const,
        },
      };
      const final = appendEvent(
        next, actor, action.type, "Human answered input request.", "human_request",
        after.id, action.reason, before, after, { actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "human_request", objectId: after.id }),
      };
    }

    case "EDIT_BRIEF": {
      const before = enriched.brief;

      const expiryCode = checkExpectedVersion(actor, action.payload.expectedVersion, before);
      if (expiryCode) {
        const next = rejectExpectedVersion(enriched, actor, action.type, "brief", { ...before, id: "brief" }, action.payload.expectedVersion, expiryCode, action.reason, actionId);
        return { state: next, result: rejected(expiryCode, { objectType: "brief", objectId: "brief", expectedVersion: action.payload.expectedVersion, beforeVersion: before.version }) };
      }

      // ── Agent must provide derivation ──
      if (actor === "agent" && !action.payload.derivation) {
        const next = appendRejectionEvent(
          enriched, actor, action.type, actionId,
          "Agent must provide derivation metadata when drafting Brief.",
          "brief", "brief", action.reason, "INVALID_ACTION",
        );
        return { state: next, result: rejected("INVALID_ACTION", { objectType: "brief", objectId: "brief" }) };
      }

      // ── Agent derivation: validate all referenced claims are reviewed ──
      const allowedStatuses: ClaimStatus[] = ["human_confirmed", "human_revised", "final"];
      if (actor === "agent" && action.payload.derivation) {
        for (const [claimId] of Object.entries(action.payload.derivation.claimVersions)) {
          const claim = enriched.claims.find((c) => c.id === claimId);
          if (!claim) {
            const next = rejectMissingObject(enriched, actor, action.type, claimId, action.reason, actionId);
            return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "claim", objectId: claimId }) };
          }
          if (!allowedStatuses.includes(claim.status)) {
            const next = appendRejectionEvent(
              enriched, actor, action.type, actionId,
              `Brief cannot cite claim ${claimId} with status ${claim.status} — only human-reviewed claims allowed.`,
              "brief", "brief", action.reason, "BRIEF_CLAIM_UNREVIEWED",
            );
            return { state: next, result: rejected("BRIEF_CLAIM_UNREVIEWED", { objectType: "claim", objectId: claimId }) };
          }
        }
      }

      const timestamp = now();
      const newVersion = nextVersion(before);
      const after = {
        ...before,
        markdown: action.payload.markdown,
        updatedBy: actor,
        updatedAt: timestamp,
        version: newVersion,
        // Agent sets derivation; Human preserves existing
        derivation:
          actor === "agent" && action.payload.derivation
            ? {
                claimVersions: action.payload.derivation.claimVersions,
                evidenceVersions: action.payload.derivation.evidenceVersions,
                generatedFromEventIds: action.payload.derivation.generatedFromEventIds,
                generatedAt: timestamp,
                generatedBy: actor,
              }
            : before.derivation,
      };
      const next = { ...enriched, brief: after };
      const final = appendEvent(
        next, actor, action.type, "Edited final brief.", "brief", "brief", action.reason,
        before, after,
        { objectVersionBefore: currentVersion(before), objectVersionAfter: newVersion, actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "brief", objectId: "brief",
          expectedVersion: action.payload.expectedVersion,
          beforeVersion: before.version, afterVersion: newVersion,
        }),
      };
    }

    case "WAIT": {
      const next = appendEvent(
        enriched, actor, action.type,
        `Agent waited for: ${action.payload.waitingFor}`,
        undefined, undefined, action.reason, { actionId },
      );
      return {
        state: next,
        result: accepted(next.events.at(-1)!.id),
      };
    }

    case "FINISH": {
      const next = {
        ...enriched,
        completed: true,
        agentStatus: "completed" as const,
        agentControl: {
          ...enriched.agentControl,
          status: "completed" as const,
        },
      };
      const final = appendEvent(
        next, actor, action.type, "Completed task.", "task", enriched.task.id,
        action.reason, enriched.completed, true, { actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "task", objectId: enriched.task.id }),
      };
    }

    case "SEND_TEAMMATE_MESSAGE": {
      const missingRelatedId = findMissingId(
        action.payload.relatedObjectIds,
        (id) => hasWorkspaceObject(enriched, id),
      );
      if (missingRelatedId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingRelatedId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "human_message", objectId: missingRelatedId }) };
      }

      const timestamp = now();
      const message: TeammateMessage = {
        id: createId("human-message", enriched),
        actor: "human",
        content: action.payload.content,
        relatedObjectIds: action.payload.relatedObjectIds,
        createdAt: timestamp,
        status: "pending",
      };

      const next = {
        ...enriched,
        messages: [...(enriched.messages ?? []), message],
      };

      const final = appendEvent(
        next, actor, action.type,
        "Human sent a teammate message.",
        "human_message", message.id, action.reason,
        undefined, undefined,
        { actionId },
      );

      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, { objectType: "human_message", objectId: message.id }),
      };
    }

    case "REPLY_TEAMMATE_MESSAGE": {
      const missingRelatedId = findMissingId(
        action.payload.relatedObjectIds,
        (id) => hasWorkspaceObject(enriched, id),
      );
      if (missingRelatedId) {
        const next = rejectMissingObject(enriched, actor, action.type, missingRelatedId, action.reason, actionId);
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "human_message", objectId: missingRelatedId }) };
      }

      const messages = enriched.messages ?? [];
      const parent = action.payload.inReplyToMessageId
        ? messages.find((m) => m.id === action.payload.inReplyToMessageId)
        : undefined;
      if (action.payload.inReplyToMessageId && !parent) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.inReplyToMessageId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "human_message", objectId: action.payload.inReplyToMessageId }) };
      }

      const timestamp = now();
      const reply: TeammateMessage = {
        id: createId("agent-message", enriched),
        actor: "agent",
        content: action.payload.content,
        relatedObjectIds: action.payload.relatedObjectIds,
        createdAt: timestamp,
        status: "resolved",
        inReplyToMessageId: action.payload.inReplyToMessageId,
      };
      const nextMessages = messages.map((message) =>
        message.id === parent?.id
          ? {
              ...message,
              status: message.status === "pending" ? "read" as const : message.status,
              acknowledgedAt: message.acknowledgedAt ?? timestamp,
            }
          : message,
      );
      const next = {
        ...enriched,
        messages: [...nextMessages, reply],
      };
      const final = appendEvent(
        next, actor, action.type, "Agent replied to a teammate message.",
        "human_message", reply.id, action.reason,
        undefined, undefined, { actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "human_message",
          objectId: reply.id,
        }),
      };
    }

    case "MARK_MESSAGE_READ": {
      const messages = enriched.messages ?? [];
      const before = messages.find((m) => m.id === action.payload.messageId);
      if (!before) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.messageId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "human_message", objectId: action.payload.messageId }) };
      }
      const timestamp = now();
      const after: TeammateMessage = {
        ...before,
        status: before.status === "pending" ? "read" : before.status,
        acknowledgedAt: before.acknowledgedAt ?? timestamp,
      };
      const next = {
        ...enriched,
        messages: messages.map((message) =>
          message.id === after.id ? after : message,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, "Agent marked a teammate message read.",
        "human_message", after.id, action.reason,
        before, after, { actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "human_message",
          objectId: after.id,
        }),
      };
    }

    case "RESOLVE_TEAMMATE_MESSAGE": {
      const messages = enriched.messages ?? [];
      const before = messages.find((m) => m.id === action.payload.messageId);
      if (!before) {
        const next = rejectMissingObject(enriched, actor, action.type, action.payload.messageId, action.reason, actionId);
        return { state: next, result: rejected("OBJECT_NOT_FOUND", { objectType: "human_message", objectId: action.payload.messageId }) };
      }
      const successfulActionIds = new Set(
        enriched.events
          .filter((event) => event.actionId && event.actionType !== "ACTION_REJECTED")
          .map((event) => event.actionId!),
      );
      const hasMissingAction = action.payload.resolvedByActionIds.some(
        (id) => !successfulActionIds.has(id),
      );
      if (hasMissingAction) {
        const next = appendRejectionEvent(
          enriched, actor, action.type, actionId,
          "Message resolution requires real successful action IDs.",
          "human_message", before.id, action.reason, "INVALID_REFERENCE",
        );
        return { state: next, result: rejected("INVALID_REFERENCE", { objectType: "human_message", objectId: before.id }) };
      }
      const timestamp = now();
      const after: TeammateMessage = {
        ...before,
        status: "resolved",
        acknowledgedAt: before.acknowledgedAt ?? timestamp,
        resolvedAt: timestamp,
        resolvedByActionIds: action.payload.resolvedByActionIds,
      };
      const next = {
        ...enriched,
        messages: messages.map((message) =>
          message.id === after.id ? after : message,
        ),
      };
      const final = appendEvent(
        next, actor, action.type, "Agent resolved a teammate message.",
        "human_message", after.id, action.reason,
        before, after, { actionId },
      );
      return {
        state: final,
        result: accepted(final.events.at(-1)!.id, {
          objectType: "human_message",
          objectId: after.id,
        }),
      };
    }
  }
}

// ── Compatibility wrapper: applyWorkspaceAction (V0.1 signature) ─────────

export function applyWorkspaceAction(
  state: WorkspaceState,
  action: WorkspaceAction,
  actor: Actor,
): WorkspaceState {
  return applyWorkspaceActionWithResult(state, action, actor).state;
}

// ── Event helpers ────────────────────────────────────────────────────────

interface AppendEventOpts {
  objectVersionBefore?: number;
  objectVersionAfter?: number;
  actionId?: string;
}

function appendEvent(
  state: WorkspaceState,
  actor: Actor,
  actionType: string,
  summary: string,
  objectType?: WorkspaceObjectType,
  objectId?: string,
  reason?: string,
  beforeObject?: unknown,
  afterObject?: unknown,
  opts?: AppendEventOpts,
): WorkspaceState {
  return withV02Defaults({
    ...state,
    events: [
      ...state.events,
      createWorkspaceEvent(
        {
          actor,
          actionType,
          objectType,
          objectId,
          summary,
          reason,
          actionId: opts?.actionId,
          objectVersionBefore: opts?.objectVersionBefore,
          objectVersionAfter: opts?.objectVersionAfter,
          changes:
            beforeObject !== undefined && afterObject !== undefined
              ? computeChanges(
                  beforeObject as Record<string, unknown>,
                  afterObject as Record<string, unknown>,
                  new Set(["updatedAt", "version", "updatedBy"]),
                )
              : undefined,
        },
        state.events.length,
      ),
    ],
  });
}

function rejectMissingObject(
  state: WorkspaceState,
  actor: Actor,
  actionType: string,
  objectId: string,
  reason?: string,
  actionId?: string,
): WorkspaceState {
  return withV02Defaults({
    ...state,
    events: [
      ...state.events,
      createWorkspaceEvent(
        {
          actor,
          actionType: "ACTION_REJECTED",
          actionId,
          objectId,
          summary: `${actionType} rejected because object ${objectId} was not found.`,
          reason,
          rejectionCode: "OBJECT_NOT_FOUND",
        },
        state.events.length,
      ),
    ],
  });
}

function rejectExpectedVersion(
  state: WorkspaceState,
  actor: Actor,
  actionType: string,
  objectType: WorkspaceObjectType,
  current: { id?: string; version: number },
  expectedVersion: number | undefined,
  rejectionCode: ActionRejectionCode,
  reason?: string,
  actionId?: string,
): WorkspaceState {
  const missingExpectedVersion = rejectionCode === "INVALID_ACTION";

  return withV02Defaults({
    ...state,
    events: [
      ...state.events,
      createWorkspaceEvent(
        {
          actor,
          actionType: "ACTION_REJECTED",
          actionId,
          objectType,
          objectId: current.id,
          summary: missingExpectedVersion
            ? `${actionType} rejected: Agent must include expectedVersion when updating an existing object.`
            : `${actionType} rejected: expected version ${expectedVersion} but current version is ${current.version}.`,
          reason,
          rejectionCode,
          expectedVersion,
          objectVersionBefore: current.version,
        },
        state.events.length,
      ),
    ],
  });
}

function appendRejectionEvent(
  state: WorkspaceState,
  actor: Actor,
  actionType: string,
  actionId: string,
  summary: string,
  objectType?: WorkspaceObjectType,
  objectId?: string,
  reason?: string,
  rejectionCode?: ActionRejectionCode,
): WorkspaceState {
  return withV02Defaults({
    ...state,
    events: [
      ...state.events,
      createWorkspaceEvent(
        {
          actor,
          actionType: "ACTION_REJECTED",
          actionId,
          objectType,
          objectId,
          summary,
          reason,
          rejectionCode,
        },
        state.events.length,
      ),
    ],
  });
}

/**
 * Append a control event (AGENT_STARTED, AGENT_PAUSED, AGENT_RESUMED, AGENT_COMPLETED).
 * These are system-level lifecycle events, not ACTION_REJECTED.
 */
export function appendControlEvent(
  state: WorkspaceState,
  eventType: "AGENT_STARTED" | "AGENT_PAUSED" | "AGENT_RESUMED" | "AGENT_COMPLETED",
  runId?: string,
  stepCount?: number,
  reason?: string,
): WorkspaceState {
  const summaries: Record<string, string> = {
    AGENT_STARTED: runId ? `Agent run started (${runId}).` : "Agent run started.",
    AGENT_PAUSED: runId
      ? `Agent paused after ${stepCount ?? "?"} steps (run ${runId}).`
      : "Agent paused.",
    AGENT_RESUMED: runId ? `Agent resumed — new run ${runId}.` : "Agent resumed.",
    AGENT_COMPLETED: stepCount !== undefined
      ? `Agent completed after ${stepCount} steps.`
      : "Agent completed.",
  };

  return withV02Defaults({
    ...state,
    events: [
      ...state.events,
      createWorkspaceEvent(
        {
          actor: "system",
          actionType: eventType,
          objectType: "agent_control",
          summary: summaries[eventType] ?? eventType,
          reason,
        },
        state.events.length,
      ),
    ],
  });
}
