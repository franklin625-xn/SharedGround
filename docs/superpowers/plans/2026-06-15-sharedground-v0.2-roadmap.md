# SharedGround V0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SharedGround from V0.1 round-based state replacement into a versioned continuous action protocol where Human and Agent both submit small actions against the latest shared workspace.

**Architecture:** Keep the single Next.js/Zustand/localStorage app. Move Agent execution from "API applies actions and returns full state" to "API proposes actions; browser applies each action to latest local state through the reducer and records apply results." Add versioned objects, slim events, recent Human change acknowledgement, Markdown sources, stable Evidence locations, Brief derivation checks, and V0.2 evaluation metrics without adding WebSocket, SSE, Redis, database, multi-user, CRDT, vector search, RAG, PDF/OCR, live web search, or multi-agent orchestration.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zustand, Zod, Vitest, Tailwind CSS, localStorage, Markdown, existing OpenAI-compatible API fallback.

---

## Current Implementation Assessment

V0.1 already has the right spine:

- `core/reducer.ts` is the single mutation point and already validates permissions and references.
- `core/permissions.ts` enforces Human authority, including Agent rejection for `ANSWER_HUMAN_INPUT`, `FINISH`, and Human-only claim statuses.
- `agent/action-schema.ts` already defines a Zod discriminated union and caps Agent turns at three actions.
- `agent/build-context.ts` already builds a workspace snapshot and exposes Human events.
- `store/workspace-store.ts` already has one persisted workspace and one `runAgent` command.
- `eval/*` already separates Outcome, Process, and Traceability.
- Workspace UI already exposes Sources, Evidence, Notes, Claims, Brief, Agent controls, Human requests, and Activity Log.

The real gaps:

- `/api/agent/route.ts` currently applies actions server-side and returns a full replacement `state`; this can overwrite Human edits made while the request is in flight.
- Objects do not have consistent `version`, `updatedBy`, or `updatedAt`.
- Actions do not carry `actionId`, `expectedVersion`, `runId`, or `stepId`.
- Reducer returns only `WorkspaceState`, not action apply metadata.
- `WorkspaceEvent.before/after` can contain large objects and will become unsafe after `Source.content`.
- `Source` only stores metadata and `summary`, not Markdown body.
- `Evidence` has no section, line range, polarity, source version, or content hash.
- Recent Human Changes are implicit in events but not acknowledged.
- `Brief` has no derivation metadata and cannot be marked stale.
- Mock Agent is a fixed V0.1 trajectory, not a document-processing step participant.

## Target V0.2 Data Model

This is the target shape after V0.2, not phase-by-phase drift.

```ts
type Actor = "human" | "agent" | "system";

type VersionedMetadata = {
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  updatedBy: Actor;
};

type Source = VersionedMetadata & {
  id: string;
  title: string;
  publisher?: string;
  url?: string;
  publishedAt?: string;
  fileName?: string;
  mediaType: "markdown" | "demo" | "manual";
  content: string;
  contentHash: string;
  lineCount: number;
  summary?: string;
  addedBy?: Actor; // V0.1 compatibility only; new logic uses createdBy
};

type EvidencePolarity = "supporting" | "counter" | "context";

type Evidence = VersionedMetadata & {
  id: string;
  sourceId: string;
  sourceVersion: number;
  sourceContentHash: string;
  quoteOrFinding: string;
  relevance: string;
  section?: string;
  startLine?: number;
  endLine?: number;
  polarity: EvidencePolarity;
  addedBy?: Actor; // V0.1 compatibility only; new logic uses createdBy
};

type ResearchNote = VersionedMetadata & {
  id: string;
  content: string;
  sourceIds: string[];
  evidenceIds: string[];
  createdBy: Actor; // existing field retained
};

type ClaimStatus =
  | "ai_proposed"
  | "human_confirmed"
  | "human_revised"
  | "contested"
  | "evidence_insufficient"
  | "final";

type Claim = VersionedMetadata & {
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

type BriefDerivation = {
  claimVersions: Record<string, number>;
  evidenceVersions: Record<string, number>;
  generatedFromEventIds: string[];
  generatedAt: string;
  generatedBy: Actor;
};

type Brief = VersionedMetadata & {
  markdown: string;
  derivation?: BriefDerivation;
};

type HumanInputRequest = {
  id: string;
  question: string;
  relatedObjectIds: string[];
  status: "open" | "answered";
  answer?: string;
  createdAt: string;
  answeredAt?: string;
};

type HumanTeammateMessage = {
  id: string;
  content: string;
  relatedObjectIds: string[];
  createdAt: string;
  acknowledgedByAgentAt?: string;
  acknowledgedInTurnId?: string;
};

type WorkspaceObjectType =
  | "task"
  | "source"
  | "evidence"
  | "note"
  | "claim"
  | "brief"
  | "human_request"
  | "human_message"
  | "agent_control";

type EventChange = {
  field: string;
  before?: unknown;
  after?: unknown;
};

type WorkspaceEvent = {
  id: string;
  timestamp: string;
  actor: Actor;
  actionId?: string;
  runId?: string;
  stepId?: string;
  actionType: string;
  objectType?: WorkspaceObjectType;
  objectId?: string;
  objectVersionBefore?: number;
  objectVersionAfter?: number;
  expectedVersion?: number;
  summary: string;
  changes?: EventChange[];
  reason?: string;
  rejectionCode?: ActionRejectionCode;
  legacyBefore?: unknown;
  legacyAfter?: unknown;
};

type AgentRunStatus =
  | "idle"
  | "running"
  | "applying"
  | "paused"
  | "waiting_for_human"
  | "completed"
  | "error";

type AgentControl = {
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

type WorkspaceState = {
  schemaVersion: 2;
  task: ResearchTask;
  sources: Source[];
  evidence: Evidence[];
  notes: ResearchNote[];
  claims: Claim[];
  brief: Brief;
  humanMessages: HumanTeammateMessage[];
  events: WorkspaceEvent[];
  agentStatus: AgentStatus; // retained for V0.1 UI compatibility during migration
  agentControl: AgentControl;
  pendingHumanRequest?: HumanInputRequest;
  completed: boolean;
};

type AgentStopReason =
  | "step_complete"
  | "waiting_for_human"
  | "paused"
  | "insufficient_evidence"
  | "task_complete"
  | "error";

type AgentTurn = {
  turnId: string;
  situation: string;
  nextGoal: string;
  actions: WorkspaceAction[];
  acknowledgedHumanEventIds: string[];
  stopReason: AgentStopReason;
};

type ActionRejectionCode =
  | "PERMISSION_DENIED"
  | "OBJECT_NOT_FOUND"
  | "INVALID_REFERENCE"
  | "STALE_OBJECT_VERSION"
  | "INVALID_ACTION"
  | "CONTENT_IMMUTABLE"
  | "LINE_RANGE_INVALID"
  | "AGENT_STATE_REGRESSION";

type ActionApplyResult = {
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
```

### Canonical Actor Fields

`createdBy` is the canonical creator field. `updatedBy` is the canonical last-modifier field. `addedBy` remains only as a V0.1 compatibility field on Source and Evidence so older persisted workspaces and demo fixtures can migrate without data loss.

New business logic, permission checks, selectors, and evaluation rules should not depend on `addedBy`. During migration, `addedBy` may be used to backfill `createdBy`; after migration, `createdBy` and `updatedBy` are authoritative. Whether `addedBy` is finally removed should be left to V0.3 or a later compatibility-cleanup phase.

### Persistence Rules

Persist:

- all workspace entities;
- `humanMessages`;
- slim `events`;
- `agentControl` except transient request machinery;
- `Brief.derivation`;
- `schemaVersion`.

Do not persist:

- `AbortController`;
- in-flight `Promise`;
- transient fetch response body;
- derived selectors such as `briefIsStale`;
- full `Source.content` in event changes;
- full workspace snapshots in events.

Derived state:

- `briefIsStale`;
- `pendingHumanDecisions`;
- `recentHumanChanges`;
- source line arrays split from `Source.content`;
- claim support coverage metrics.

Fields requiring V0.1 migration:

- `schemaVersion`;
- `version`, `createdBy`, `updatedBy`, `updatedAt` on all versioned objects;
- `Source.content`, `contentHash`, `lineCount`, `mediaType`;
- `Evidence.sourceVersion`, `sourceContentHash`, `polarity`;
- `Brief.version`, `createdAt`, `createdBy`, `derivation`;
- `AgentControl`;
- `humanMessages`;
- legacy event `before/after` compatibility.

Migration should use `addedBy` only as an input for `createdBy` where V0.1 objects do not already have canonical actor metadata.

## Action Protocol

### Keep

- `SEARCH_SOURCE`: keep as Agent-only no-op/request marker; V0.2 still does not implement live search.
- `ADD_SOURCE`: extend payload with Markdown fields.
- `EDIT_SOURCE`: edit metadata only; content is immutable.
- `ADD_EVIDENCE`: extend with location and polarity.
- `EDIT_EVIDENCE`: require `expectedVersion` for Agent, optional for Human.
- `ADD_NOTE`.
- `EDIT_NOTE`: require `expectedVersion` for Agent.
- `PROPOSE_CLAIM`.
- `UPDATE_CLAIM`: require `expectedVersion` for Agent.
- `CHALLENGE_CLAIM`: require `expectedVersion` for Agent if Agent challenges an existing claim.
- `REQUEST_HUMAN_INPUT`.
- `ANSWER_HUMAN_INPUT`.
- `EDIT_BRIEF`: require `expectedVersion` for Agent; include derivation metadata when Agent drafts.
- `WAIT`.
- `FINISH`: Human-only.

### Add

- `SEND_TEAMMATE_MESSAGE`: Human-only non-blocking direction signal. It creates a `HumanTeammateMessage` and an event. It does not set `pendingHumanRequest`, does not force `waiting_for_human`, and does not require Agent to stop. It differs from `ANSWER_HUMAN_INPUT`, which answers a blocking Agent request.

`HumanTeammateMessage` is the authoritative copy of the message body. The `SEND_TEAMMATE_MESSAGE` event stores only `objectType: "human_message"`, `objectId`, a short summary, and small metadata such as related object IDs. It must not duplicate the full message content. Acknowledgement still uses the corresponding event ID; `build-context` resolves the event to the message object when it needs the full text.

Do not add `ACKNOWLEDGE_HUMAN_CHANGES` to the `WorkspaceAction` discriminated union. The model declares acknowledgement only through `AgentTurn.acknowledgedHumanEventIds`. After action application completes, the store calls a reducer-backed/system helper to persist acknowledgement and may write a slim system event. This keeps acknowledgement auditable without expanding the model-output action surface.

### Do Not Add As Domain Actions

These are Agent goals or UI labels, not reducer actions:

- `READ_DOCUMENTS`;
- `ANALYZE_COVERAGE`;
- `EXTRACT_EVIDENCE`;
- `DRAFT_BRIEF`;
- `UPDATE_BRIEF`;
- `WAIT_TEAMMATE_CONTINUE`.

They belong in `AgentTurn.nextGoal`, `AgentControl.currentGoal`, `situation`, or UI copy. Adding them as actions would inflate the protocol without adding state semantics.

### Pause And Resume

`PAUSE_AGENT` and `RESUME_AGENT` should be store control commands, not Agent-emitted workspace actions. Reason:

- they control the browser loop, not research domain state;
- Agent must not be able to resume itself after Human pauses it;
- the reducer can still log `AGENT_PAUSED` and `AGENT_RESUMED` as system/Human events through store helpers.

Pause terminates and invalidates the current run. Resume does not continue the previous `runId`; it creates a new `runId` from the latest workspace state. Any response from the old run must be discarded. The UI may label the command "Resume" because that is user-friendly, but the technical meaning is "start a new run from current state." Page refresh never restores an in-flight run.

### Action IDs And Versions

Every action should carry:

```ts
type ActionEnvelope = {
  actionId: string;
  runId?: string;
  stepId?: string;
  type: string;
  payload: unknown;
  reason?: string;
};
```

Rules:

- Browser generates `actionId` for Human actions before applying them.
- API or Agent execution code generates `actionId`, `runId`, and `stepId` for Agent actions if the model omits them.
- Agent update actions on existing objects must include `expectedVersion`.
- Human actions do not require `expectedVersion`; if a UI includes it, reducer may ignore mismatch for Human or use it only to show a local warning.
- Agent add actions do not need `expectedVersion`, but must reference valid current IDs.

## Conflict Rules

### Human Always Wins

Human always wins means:

- Human actions are applied to current local state immediately.
- Agent never returns or replaces a full workspace.
- Agent updates to existing objects are rejected if their `expectedVersion` no longer matches.
- Agent cannot downgrade Human-reviewed statuses.
- Agent cannot edit immutable Source content.
- Agent must reread state after a rejection instead of auto-merging.

It does not mean Human actions can violate object references or schema. Human actions still pass schema and reference validation.

### Rejection Codes

- `PERMISSION_DENIED`: actor is not allowed to perform the action.
- `OBJECT_NOT_FOUND`: target object ID does not exist.
- `INVALID_REFERENCE`: related IDs, source IDs, evidence IDs, or request IDs are invalid.
- `STALE_OBJECT_VERSION`: Agent expected version differs from current object version.
- `INVALID_ACTION`: payload fails schema or violates action-specific requirements.
- `CONTENT_IMMUTABLE`: attempt to edit uploaded Source content.
- `LINE_RANGE_INVALID`: Evidence line range is outside current Source line count or start is after end.
- `AGENT_STATE_REGRESSION`: Agent tries to move a Human-reviewed claim back to an AI-only status.

### Partial Success

Allow partial success within one AgentTurn. Apply actions sequentially against latest state:

- accepted actions stay accepted;
- rejected actions write `ACTION_REJECTED` events and `ActionApplyResult`;
- continue later actions unless the rejection is `PERMISSION_DENIED`, `STALE_OBJECT_VERSION`, or `AGENT_STATE_REGRESSION` on the same object that a later action depends on.

Simpler implementation: always apply sequentially and let later actions fail naturally if their references are invalid. The apply results give the Agent enough feedback next step.

### Agent Receives Apply Results

The next `/api/agent-step` request should include:

- latest workspace snapshot;
- recent Human changes;
- previous step `ActionApplyResult[]`;
- last accepted/rejected event summaries.

This lets the Agent know which proposed actions actually changed state.

### No Automatic Merge

Do not auto-merge in V0.2:

- object payloads are semantic, not line-based;
- Human judgement changes should not be silently blended with Agent text;
- reducer-level rejection is easier to audit;
- auto-merge risks hiding authority transfer.

### Claim Status Regression

Agent may not set status to:

- `human_confirmed`;
- `human_revised`;
- `final`.

Agent also may not move any claim currently in:

- `human_confirmed`;
- `human_revised`;
- `contested`;
- `evidence_insufficient`;
- `final`;

back to `ai_proposed`. If Agent wants to respond, it should add evidence, add a note, update reasoning without changing Human status where allowed, or request Human input.

## Agent Step Loop

### State Machine

```text
idle -> running -> applying -> running
running -> waiting_for_human
running -> paused
running -> completed
running -> error
applying -> paused
waiting_for_human -> running after Human answer or resume
paused -> running on resume
error -> running on retry or idle on reset
completed is terminal unless workspace reset
```

### Execution Pseudocode

```ts
function startAgentRun() {
  const runId = createRunId();
  setAgentControl({
    status: "running",
    activeRunId: runId,
    stepCountInRun: 0,
    error: undefined,
  });
  scheduleNextStep(runId);
}

async function runAgentStep(runId: string) {
  const stateBeforeFetch = getLatestWorkspace();
  const control = stateBeforeFetch.agentControl;

  if (control.status !== "running") return;
  if (control.activeRunId !== runId) return;
  if (control.stepCountInRun >= control.maxStepsPerRun) {
    setAgentControl({ status: "paused", currentGoal: "Step limit reached." });
    return;
  }

  const stepId = createStepId(runId, control.stepCountInRun + 1);
  const abortController = new AbortController();
  setTransientAbortController(abortController);
  setAgentControl({ activeStepId: stepId });

  const response = await fetch("/api/agent-step", {
    method: "POST",
    body: JSON.stringify({
      runId,
      stepId,
      workspace: stateBeforeFetch,
      previousApplyResults: getPreviousApplyResults(),
    }),
    signal: abortController.signal,
  });

  if (getLatestWorkspace().agentControl.activeRunId !== runId) {
    incrementDiscardedStaleRunResponseCount();
    return;
  }
  if (getLatestWorkspace().agentControl.activeStepId !== stepId) {
    incrementDiscardedStaleRunResponseCount();
    return;
  }

  const turn = await response.json();
  setAgentControl({ status: "applying", currentGoal: turn.nextGoal });

  const results: ActionApplyResult[] = [];
  for (const action of turn.actions.slice(0, maxActionsPerStep)) {
    const latest = getLatestWorkspace();
    const { state, result } = applyWorkspaceActionWithResult(
      latest,
      withRunStepActionIds(action, runId, stepId),
      "agent",
    );
    setWorkspace(state);
    results.push(result);
  }

  acknowledgeHumanEvents(turn.acknowledgedHumanEventIds, results);
  setPreviousApplyResults(results);

  if (turn.stopReason === "waiting_for_human" || hasOpenHumanRequest()) {
    setAgentControl({ status: "waiting_for_human" });
    return;
  }
  if (turn.stopReason === "task_complete" || getLatestWorkspace().completed) {
    setAgentControl({ status: "completed" });
    return;
  }
  if (getLatestWorkspace().agentControl.status === "paused") return;

  setAgentControl({
    status: "running",
    stepCountInRun: getLatestWorkspace().agentControl.stepCountInRun + 1,
    lastCompletedStepId: stepId,
  });
  scheduleNextStep(runId);
}

function pauseAgent() {
  abortActiveFetch();
  const invalidatedRunId = getLatestWorkspace().agentControl.activeRunId;
  setAgentControl({
    status: "paused",
    activeRunId: undefined,
    activeStepId: undefined,
  });
  appendControlEvent("AGENT_PAUSED");
  invalidateRun(invalidatedRunId);
}

function resumeAgent() {
  if (hasOpenHumanRequest()) {
    setAgentControl({ status: "waiting_for_human" });
    return;
  }
  // Resume creates a fresh runId from the latest workspace; it never reuses
  // the invalidated run that was active before Pause or page refresh.
  startAgentRun();
}
```

### Loop Rules

- Start creates one `runId`.
- Resume also creates a fresh `runId`; it does not continue the run that was paused.
- Each request creates one `stepId`.
- Only one active request is allowed.
- Use `AbortController` for Pause and Reset. Pause invalidates the current `runId` even if abort is not observed by the network stack.
- If an old response returns after a new run/step is active, discard it and increment `discardedStaleRunResponseCount`.
- Each step should apply at most three actions to match V0.1.
- Default `maxStepsPerRun`: 12. After that, pause with a visible reason.
- Automatically continue after a step only when status is `running`, no open request exists, and stop reason is `step_complete`.
- `REQUEST_HUMAN_INPUT` stops the loop in `waiting_for_human`.
- `WAIT` means Agent voluntarily yields because it needs Human input; Pause means Human stops execution regardless of Agent intent.
- Page refresh should not automatically resume a run or preserve an in-flight `runId`. Persist `paused` or `idle`; require explicit Resume to create a new run from current state.
- Mock Agent adapts by becoming step-aware and source-aware: one step may summarize unread sources, next extracts evidence, next proposes claims, next drafts after Human review.

## Recent Human Changes

### Options

Option 1: single monotonic event cursor.

- Store `lastHandledHumanEventId`.
- Context includes Human events after the cursor.
- Simple, compact, easy to reason about.
- Weakness: Agent may handle event 9 but not event 8; a cursor cannot express partial acknowledgement.

Option 2: explicit `acknowledgedHumanEventIds`.

- Store an array/set of Human event IDs acknowledged by Agent.
- Context includes Human events that are relevant and not acknowledged.
- Supports partial handling.
- More storage and more rules, but still small in V0.2.

Recommendation: use explicit `acknowledgedHumanEventIds`.

Reason: V0.2 specifically requires comparing partial handling, stale rejection behavior, teammate messages, and multiple Human edits. A single cursor is too coarse and can falsely mark unhandled edits as handled.

### Which Events Enter Recent Human Changes

Include Human events with object impact:

- `ADD_SOURCE`;
- `EDIT_SOURCE`;
- `ADD_EVIDENCE`;
- `EDIT_EVIDENCE`;
- `ADD_NOTE`;
- `EDIT_NOTE`;
- `UPDATE_CLAIM`;
- `CHALLENGE_CLAIM`;
- `EDIT_BRIEF`;
- `ANSWER_HUMAN_INPUT`;
- `SEND_TEAMMATE_MESSAGE`;
- `FINISH` if not completed.

Exclude:

- UI-only pause/resume events from Recent Human Changes unless the Agent needs to explain why it stopped;
- rejected Human actions;
- old legacy events without object or message meaning unless needed for migration display.

### Acknowledgement Rules

- AgentTurn may include `acknowledgedHumanEventIds`.
- Acknowledgement is persisted in `agentControl.acknowledgedHumanEventIds`.
- `WAIT` counts as acknowledgement only for the specific open `REQUEST_HUMAN_INPUT` context it is waiting on, not for arbitrary Human edits.
- Stale-rejected Agent actions do not count as handling the related Human event.
- Multiple Human events can be partially acknowledged.
- If Agent acknowledges an event but emits no relevant action or explanation, keep it visible as "seen" but not "responded" for evaluation.

### Build Context Display

`buildWorkspaceSnapshot` should put this near the top:

```text
## Recent Human Changes
- [event-0012] EDIT_EVIDENCE evidence-0003 v2 by Human
  Before: relevance="..."
  After: relevance="..."
  Reason: Human corrected overstatement.
- [event-0013] SEND_TEAMMATE_MESSAGE human-message-0001
  Message: "Prioritize the policy memo over the company blog."
```

Include apply result feedback:

```text
## Previous Agent Apply Results
- action-010 accepted ADD_EVIDENCE evidence-0009 v1
- action-011 rejected UPDATE_CLAIM claim-0002 STALE_OBJECT_VERSION expected v1 current v2
```

## Markdown Source And Evidence Location

### Upload Entry

Add upload in the Source panel and optionally the New Research Task form:

- accept `.md`, `text/markdown`, and `text/plain` with `.md` extension;
- use `File.text()`;
- create one `ADD_SOURCE` action per file;
- apply all through reducer as Human actions.

### Limits

Recommended V0.2 limits:

- single file: 300 KB;
- total persisted Markdown content: 2 MB;
- max files per upload: 12;
- warn before adding content that would exceed the limit.

### Source Mutability

Recommendation: uploaded `Source.content` is immutable.

Editable:

- title;
- publisher;
- url;
- publishedAt;
- summary.

Not editable:

- content;
- contentHash;
- lineCount;
- fileName except by replacing the source.

To replace body text, create a new Source. Reason: editing content invalidates Evidence line ranges and makes traceability ambiguous.

### Source Deletion

Do not support Source deletion in V0.2. Deleting a Source would require cascading Evidence, Claim, Note, Brief derivation, and event semantics. If needed later, add archival status rather than physical delete.

### Evidence Location Rules

- `sourceId` must exist.
- `sourceVersion` must equal current Source version at extraction time.
- `sourceContentHash` must equal current Source content hash at extraction time.
- `startLine` and `endLine` are optional for manually entered evidence but required for Agent-extracted evidence from Markdown.
- If provided, both must be positive integers.
- `startLine <= endLine`.
- `endLine <= source.lineCount`.
- Line range over the limit is `LINE_RANGE_INVALID`.
- Evidence still stores `quoteOrFinding`; line range helps locate it, but quote text remains the durable citation snippet.
- `polarity` defaults to `context` for notes, `supporting` for claim support, and must be explicit when used in claims.

## Brief Derivation And Stale Detection

### Human-Reviewed Claims

Human-reviewed statuses:

- `human_confirmed`;
- `human_revised`;
- `contested`;
- `evidence_insufficient`;
- `final`.

Claims allowed in Agent-drafted final Brief:

- `human_confirmed`;
- `human_revised`;
- `final`.

Claims not allowed as final conclusions:

- `ai_proposed`;
- `contested`;
- `evidence_insufficient`.

Contested and insufficient claims may appear only in a limitations/open questions section if the Human explicitly asks for that framing.

### Derivation Metadata

Agent `EDIT_BRIEF` should include:

- `claimVersions` for every claim cited or used;
- `evidenceVersions` for every evidence cited or used;
- `generatedFromEventIds` for relevant Human review events and messages.

Human manual edits:

- keep existing derivation if the Human edits wording only;
- set `derivation.generatedBy = "human"` or add a `humanEditedAfterGeneration` flag if the body changes materially;
- do not auto-refresh derivation maps unless the UI offers a "mark current brief as reviewed" control later.

### Stale Calculation

Make stale a selector, not a persisted field:

```ts
briefIsStale =
  brief.derivation exists &&
  any claim version in map differs from current claim.version ||
  any evidence version in map differs from current evidence.version ||
  any cited claim/evidence no longer exists ||
  any used claim no longer has an allowed Human-reviewed status
```

Effects:

- Claim status/version changes can stale the Brief.
- Evidence version changes can stale the Brief.
- Source version/content changes should not occur for content; metadata-only Source edits do not stale Brief unless cited source metadata is displayed.
- Stale Brief may be exported, but export should include a visible warning.
- Agent may propose a refresh while running, but should not silently overwrite a Human-edited Brief. Prefer Human command or explicit teammate message: "refresh brief from reviewed claims."

## Event Log Slimming

### Final Event Shape

Use the `WorkspaceEvent` target shape above with `changes` instead of large `before/after`.

ADD action records:

- object ID;
- object version after;
- compact summary fields such as title, statement, or quote preview;
- never full `Source.content`.

UPDATE action records:

- changed scalar fields only;
- before/after values for small fields;
- for arrays, before/after IDs;
- no full Markdown source body.

Rejection event records:

- actionId;
- actionType;
- target object ID if known;
- `rejectionCode`;
- expected/current versions where relevant;
- reason;
- no full workspace snapshot.

Keep `runId`, `stepId`, and `actionId` in events for Agent-loop debugging and evaluation.

V0.1 events:

- keep readable through `legacyBefore` and `legacyAfter` or by migration that moves old `before/after` into those fields;
- evaluation rules should prefer new fields but tolerate legacy.

## Migration

### Persistence Version

Set Zustand persist version to `2`.

Migration function:

```ts
migrate(persisted, version) {
  if (version >= 2 && persisted.workspace?.schemaVersion === 2) return persisted;
  return migrateV1ToV2(persisted);
}
```

### V0.1 To V0.2 Rules

- `WorkspaceState.schemaVersion = 2`.
- Add `agentControl` defaults:
  - `status` from old `agentStatus`;
  - `maxStepsPerRun = 12`;
  - `maxActionsPerStep = 3`;
  - `acknowledgedHumanEventIds = []`;
  - `discardedStaleRunResponseCount = 0`;
  - `mode = "idle"`.
- Add `humanMessages = []`.
- For Sources:
  - `version = 1`;
  - `createdBy = addedBy ?? "system"`;
  - `updatedBy = addedBy ?? "system"`;
  - `updatedAt = createdAt`;
  - `content = summary ?? ""` for demo sources;
  - `contentHash = hash(content)`;
  - `lineCount = countLines(content)`;
  - `mediaType = "demo"`.
- For Evidence:
  - `version = 1`;
  - `createdBy = addedBy ?? "system"`;
  - `updatedBy = addedBy ?? "system"`;
  - `updatedAt = createdAt`;
  - `sourceVersion = current source.version ?? 1`;
  - `sourceContentHash = current source.contentHash`;
  - `polarity = "supporting"`.
- For Notes and Claims:
  - fill `version = 1`;
  - fill `updatedBy` from `createdBy` if missing.
- For Brief:
  - `version = 1`;
  - `createdAt = updatedAt`;
  - `createdBy = updatedBy`;
  - no derivation unless it already has citations that can be resolved.
- For Events:
  - preserve existing events;
  - do not attempt to expand missing changes;
  - mark old `before/after` as legacy-compatible if needed.

Migration must be idempotent: running it twice does not increment versions or duplicate events.

On migration failure:

- show a reset fallback;
- do not silently drop workspace;
- log a readable error in `agentControl.error` if possible.

Demo state:

- Update factories to emit V0.2-native objects, not rely on migration during tests.

## Evaluation V0.2 Metrics

### staleWriteRejectionCount

- Numerator: count of `ACTION_REJECTED` events with `rejectionCode === "STALE_OBJECT_VERSION"`.
- Denominator: none; report count.
- Required fields: event `rejectionCode`.
- Meaning: how often Agent tried to write stale object versions.
- Interpretation: lower is usually better, but zero may mean no real concurrency pressure was tested.

### humanChangeResponseRate

- Numerator: Human change events that are acknowledged and followed by an accepted Agent action, WAIT/request, or note/message that references the changed object within the next N Agent steps.
- Denominator: Human change events included in Recent Human Changes.
- Required fields: `acknowledgedHumanEventIds`, event object IDs, Agent events, apply results.
- Meaning: whether Agent notices and acts on Human changes.
- Interpretation: higher is better only when changes needed response; some Human edits may require no Agent action.

### humanMessageAcknowledgementRate

- Numerator: `SEND_TEAMMATE_MESSAGE` events whose IDs appear in acknowledged Human event IDs.
- Denominator: total `SEND_TEAMMATE_MESSAGE` events.
- Required fields: `humanMessages`, events, acknowledgements.
- Meaning: whether non-blocking Human direction is seen by Agent.
- Interpretation: higher is better, but acknowledgement alone is not compliance.

### sourceLocationCompleteness

- Numerator: Evidence items with valid `sourceId`, `sourceVersion`, `sourceContentHash`, `quoteOrFinding`, and valid `startLine/endLine` when source media is Markdown and evidence added by Agent.
- Denominator: total evidence items or Agent-extracted Markdown evidence items. Report both if useful.
- Required fields: Evidence location fields and Source line counts.
- Meaning: evidence can be traced to original text.
- Interpretation: higher is better; manually entered evidence may be less complete and should be separated.

### briefStaleDetected

- Numerator: 1 if selector identifies stale Brief when derivation versions differ; 0 otherwise.
- Denominator: none or one per workspace.
- Required fields: Brief derivation maps and current object versions.
- Meaning: system can detect when Brief no longer matches reviewed claims/evidence.
- Interpretation: true is good when stale conditions exist; false is good only when no stale condition exists.

### acceptedAgentActionRate

- Numerator: accepted Agent actions.
- Denominator: total Agent apply results.
- Required fields: `ActionApplyResult`.
- Meaning: proportion of Agent proposals that successfully mutate or intentionally wait.
- Interpretation: higher may indicate stable protocol, but too high could mean tests are not stressing conflicts.

### discardedStaleRunResponseCount

- Numerator: count of discarded Agent responses due to stale `runId` or `stepId`.
- Denominator: none; optionally divide by total Agent responses.
- Required fields: `agentControl.discardedStaleRunResponseCount`.
- Meaning: request race protection actually activated.
- Interpretation: low is normal; nonzero is acceptable if races were safely handled.

## Cross-Phase Freeze Points

Freeze before Phase 1:

- `VersionedMetadata` field names and version increment rule.
- Agent `expectedVersion` rule.
- `ActionRejectionCode` enum.
- `ActionApplyResult` shape.
- slim `WorkspaceEvent` core fields.
- `runId`, `stepId`, `actionId` naming.
- `AgentControl` persisted fields.
- AgentTurn `acknowledgedHumanEventIds`.
- Source content immutability.
- Brief stale selector based on claim/evidence version maps.

Freezing these contracts before Phase 1 does not mean Phase 1 implements every business behavior. Phase 1 may reserve target fields and migration hooks, but Source content hashing semantics, Evidence line validation, full AgentControl lifecycle, acknowledgement handling, and Brief stale calculation remain assigned to their later phases.

Can delay without major rework:

- exact upload UI placement;
- exact file size copy;
- visual layout of Agent status panel;
- final wording of evaluation labels;
- whether manual Evidence line ranges are optional or gently warned;
- whether Brief export warning is a banner or inline preface.

## Phase Plan

### Phase 1: Versioned Core & Slim Events

**Goal:** Add V0.2-native version metadata and slim events while preserving V0.1 behavior.

**Why now:** All later features depend on object versions and safe event storage.

**Dependencies:** Current V0.1 reducer, event factory, types, tests.

**Exact files likely affected:**

- `core/types.ts`
- `core/event-factory.ts`
- `core/reducer.ts`
- `core/workspace-factory.ts`
- `data/demo-sources.json`
- `tests/reducer.test.ts`
- `tests/workspace-factory.test.ts`
- `tests/workspace-store.test.ts`
- `tests/evaluation.test.ts`

**Data model changes:** Enable only `schemaVersion`, `VersionedMetadata`, canonical `createdBy`/`updatedBy`, slim event fields, migration scaffolding, and V0.2-native factories. Target fields for Source content metadata, Evidence location/source-version metadata, Brief derivation, and full `AgentControl` may be added as optional/reserved type fields if needed for type compatibility, but Phase 1 must not implement their business semantics.

**Action protocol changes:** None required yet except internal event metadata support.

**Store/API/UI changes:** Minimal compatibility changes only. Do not activate the Agent step loop, Pause/Resume semantics, Recent Human Changes, Markdown upload, Evidence line validation, or Brief stale UI.

**Explicit non-goals:** No Agent loop rewrite, no upload UI, no Recent Human Changes, no Source content hashing semantics, no Evidence line-range semantics, no Brief derivation/stale semantics, and no full AgentControl lifecycle.

**Migration impact:** Add migration foundation and idempotent V0.1-to-V0.2 backfills for schema/version/actor metadata and slim event compatibility. Do not require real Markdown content hashing, Evidence source hashes, Brief derivation maps, or Agent run lifecycle migration to work in Phase 1.

**Tests to add/update:**

- new objects start at version 1;
- updates increment version;
- event changes exclude full object snapshots and are ready to exclude future Source content;
- legacy demo state factory emits V0.2 version and actor metadata;
- reserved target fields, if present, do not drive business behavior yet.

**Completion criteria:**

- V0.1 demo flow still works.
- All created/updated objects have correct version metadata.
- Events no longer require full before/after snapshots.
- Phase 1 does not implement Markdown upload, Evidence line validation, Agent step loop, or Brief stale behavior.

**Verification commands:**

```bash
npm run typecheck
npm run test
```

**Handoff to next Phase:** Reducer and events can now report version-aware apply results.

### Phase 2: Action Apply Results

**Goal:** Introduce `applyWorkspaceActionWithResult` and stale write rejection.

**Why now:** Agent loop cannot safely apply actions against latest state without apply results.

**Dependencies:** Phase 1 version metadata.

**Exact files likely affected:**

- `core/types.ts`
- `core/reducer.ts`
- `core/permissions.ts`
- `agent/action-schema.ts`
- `core/human-actions.ts`
- `tests/reducer.test.ts`
- `tests/permissions.test.ts`
- `tests/agent-api.test.ts`

**Data model changes:** Add `ActionApplyResult`, `ActionRejectionCode`.

**Action protocol changes:** Add `actionId`; add `expectedVersion` to Agent update payloads.

**Store/API/UI changes:** Keep old `applyWorkspaceAction` as compatibility wrapper around the new result-returning function.

**Explicit non-goals:** No client loop yet.

**Migration impact:** None beyond schema compatibility.

**Tests to add/update:**

- Agent stale `UPDATE_CLAIM` rejected with `STALE_OBJECT_VERSION`;
- Agent stale `EDIT_EVIDENCE` rejected;
- Human update succeeds without expectedVersion;
- Agent cannot regress Human-reviewed status.

**Completion criteria:**

- Reducer can return accepted/rejected apply metadata for every action.
- Existing tests still pass through compatibility wrapper.

**Verification commands:**

```bash
npm run typecheck
npm run test
```

**Handoff to next Phase:** Store/API can rely on apply result arrays.

### Phase 3: Markdown Sources & Stable Evidence Location

**Goal:** Add immutable Markdown Source content and stable Evidence locations.

**Why now:** Agent V0.2 needs real uploaded materials before step loop behavior matters.

**Dependencies:** Phase 1 source/evidence fields, Phase 2 validation.

**Exact files likely affected:**

- `core/types.ts`
- `agent/action-schema.ts`
- `core/reducer.ts`
- `core/human-actions.ts`
- `components/workspace/sources-panel.tsx`
- `tests/human-actions.test.ts`
- `tests/reducer.test.ts`
- `tests/sources-panel-ui.test.ts`
- `tests/workspace-store.test.ts`

**Data model changes:** Use `Source.content`, `contentHash`, `lineCount`, and Evidence line fields fully.

**Action protocol changes:** Extend `ADD_SOURCE`, `EDIT_SOURCE`, `ADD_EVIDENCE`, `EDIT_EVIDENCE`.

**Store/API/UI changes:** Upload multiple `.md` files; add file size checks; render source body preview and evidence line range.

**Explicit non-goals:** No Source deletion, no PDF/OCR, no chunking, no embeddings, no content editing.

**Migration impact:** Existing sources use summary as content.

**Tests to add/update:**

- multi-file upload builders create multiple `ADD_SOURCE` actions;
- source content edit rejected;
- invalid evidence line range rejected;
- evidence stores source version/hash.

**Completion criteria:**

- Human can upload several Markdown files.
- Evidence can point to source lines.
- Source content is not written into event changes.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** Agent can receive source content and extract evidence.

### Phase 4: Agent Step Loop & Request Race Protection

**Goal:** Replace full-state Agent response with client-applied AgentTurn actions.

**Why now:** This is the core V0.2 architecture change.

**Dependencies:** Phase 2 apply results, Phase 3 source content.

**Exact files likely affected:**

- `app/api/agent/route.ts` or new `app/api/agent-step/route.ts`
- `core/api-types.ts`
- `store/workspace-store.ts`
- `agent/execute-agent-turn.ts`
- `agent/mock-agent.ts`
- `agent/build-context.ts`
- `components/agent/agent-control-bar.tsx`
- `components/agent/agent-status.tsx`
- `tests/demo-flow.test.ts`
- `tests/agent-api.test.ts`
- `tests/real-agent-fallback.test.ts`
- `tests/workspace-store.test.ts`

**Data model changes:** `AgentControl` fields become active.

**Action protocol changes:** API returns `AgentTurn` and metadata, not applied `state`.

**Store/API/UI changes:** Add Start/Pause/Resume, runId/stepId, AbortController, stale response discard, max step limit.

**Explicit non-goals:** No SSE, WebSocket, Redis, DB, page-refresh auto resume.

**Migration impact:** Old `agentStatus` maps to new control status.

**Tests to add/update:**

- API result has no full replacement state;
- stale run response is discarded;
- pause aborts active fetch;
- request during Human edit applies actions to latest state;
- max steps pauses loop.

**Completion criteria:**

- Human edits during Agent request cannot be overwritten by old server state.
- Agent continues small steps until wait/pause/completion/limit.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** Loop can now prioritize Recent Human Changes.

### Phase 5: Human Messages & Recent Human Changes

**Goal:** Add non-blocking Human teammate messages and explicit Human event acknowledgement.

**Why now:** V0.2 collaboration claim depends on Agent prioritizing recent Human changes.

**Dependencies:** Phase 4 AgentTurn lifecycle.

**Exact files likely affected:**

- `core/types.ts`
- `agent/action-schema.ts`
- `core/reducer.ts`
- `core/human-actions.ts`
- `agent/build-context.ts`
- `agent/system-prompt.ts`
- `agent/mock-agent.ts`
- `components/agent/human-input-request.tsx`
- `components/workspace/workspace-shell.tsx`
- `tests/human-actions.test.ts`
- `tests/agent-api.test.ts`
- `tests/demo-flow.test.ts`
- `tests/evaluation.test.ts`

**Data model changes:** `humanMessages`, `acknowledgedHumanEventIds`.

**Action protocol changes:** Add `SEND_TEAMMATE_MESSAGE`; extend AgentTurn with `acknowledgedHumanEventIds`.

**Store/API/UI changes:** Add simple message input; context builder shows Recent Human Changes and previous apply results.

**Explicit non-goals:** No chat transcript, no threaded comments, no multi-user messages.

**Migration impact:** Add empty `humanMessages` and acknowledgement array.

**Tests to add/update:**

- teammate message creates event and message object;
- message appears in Recent Human Changes;
- Agent acknowledgement persists;
- stale-rejected action does not count as response.

**Completion criteria:**

- Agent context visibly prioritizes unacknowledged Human edits/messages.
- Human can send non-blocking direction without creating a blocking request.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** Brief derivation can use acknowledged Human review events.

### Phase 6: Claim / Brief Derivation Discipline

**Goal:** Ensure Agent-drafted Briefs are based on Human-reviewed claims and can be marked stale.

**Why now:** Once Agent responds continuously, final output needs stronger grounding rules.

**Dependencies:** Phase 5 acknowledgement and event metadata.

**Exact files likely affected:**

- `core/types.ts`
- `core/reducer.ts`
- `agent/action-schema.ts`
- `agent/system-prompt.ts`
- `agent/mock-agent.ts`
- `agent/build-context.ts`
- `eval/rules/citation-resolver.ts`
- `components/workspace/brief-editor.tsx`
- `components/workspace/claim-card.tsx`
- `tests/reducer.test.ts`
- `tests/demo-flow.test.ts`
- `tests/evaluation.test.ts`

**Data model changes:** `Brief.derivation`.

**Action protocol changes:** `EDIT_BRIEF` can carry derivation metadata for Agent actions.

**Store/API/UI changes:** Show stale warning; show which claims/evidence the Brief derives from.

**Explicit non-goals:** No rich diff, no automatic merge, no forced auto-refresh.

**Migration impact:** Existing Briefs have no derivation and are treated as "unknown freshness", not stale.

**Tests to add/update:**

- Agent cannot draft final Brief from only `ai_proposed` claims;
- selector marks Brief stale after claim version change;
- selector marks Brief stale after evidence version change;
- export can include stale warning.

**Completion criteria:**

- Brief freshness is computable.
- Agent follows Human-reviewed claim discipline.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** Evaluation can report V0.2 behavior.

### Phase 7: Evaluation V0.2

**Goal:** Add metrics for versioned collaboration and continuous action safety.

**Why now:** Core behavior exists and can be measured.

**Dependencies:** Phases 1-6.

**Exact files likely affected:**

- `eval/types.ts`
- `eval/process-evaluator.ts`
- `eval/trace-evaluator.ts`
- `eval/outcome-evaluator.ts`
- `eval/run-evaluation.ts`
- `components/evaluation/*`
- `tests/evaluation.test.ts`
- `tests/evaluation-export.test.ts`
- `tests/evaluation-page.test.ts`

**Data model changes:** Evaluation summary types add V0.2 fields.

**Action protocol changes:** None.

**Store/API/UI changes:** Evaluation page displays new metrics with careful interpretation.

**Explicit non-goals:** No LLM judge, no benchmark suite, no precision/recall claims beyond available data.

**Migration impact:** Legacy workspaces may show "not available" for V0.2-only metrics.

**Tests to add/update:**

- stale rejection count;
- human message acknowledgement;
- source location completeness;
- accepted Agent action rate;
- stale Brief detection.

**Completion criteria:**

- V0.2 metrics export to JSON and Markdown.
- V0.1 metrics remain intact.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** UI/docs can package the demo.

### Phase 8: UI Integration, Docs & Demo Packaging

**Goal:** Make the V0.2 flow understandable and demo-ready.

**Why now:** Protocol work is complete; final phase explains and packages it.

**Dependencies:** Phases 1-7.

**Exact files likely affected:**

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_REVIEW.md`
- `docs/DEMO_SCRIPT.md`
- `docs/OPEN_SOURCE_ATTRIBUTION.md`
- `components/workspace/workspace-shell.tsx`
- `components/agent/agent-control-bar.tsx`
- `components/agent/agent-status.tsx`
- `components/workspace/activity-log.tsx`
- `app/page.tsx`

**Data model changes:** None expected.

**Action protocol changes:** None expected.

**Store/API/UI changes:** Polish status language, reduce Activity Log visual weight, show Current Goal / Latest Action / Pending Decisions.

**Explicit non-goals:** No SaaS polish, no login, no animations, no mobile-first redesign.

**Migration impact:** Document reset fallback.

**Tests to add/update:** UI tests for displayed status and upload/demo path if not already covered.

**Completion criteria:**

- README and architecture docs describe V0.2 continuous action protocol.
- Demo script covers upload, Agent loop, Human edits, stale rejection, and Brief stale.

**Verification commands:**

```bash
npm run typecheck
npm run test
npm run build
```

**Handoff to next Phase:** V0.2 implementation can be reviewed or released.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Action surface continues to grow | Turns reducer into a platform API instead of a demo protocol | Freeze action list; keep analysis stages in `nextGoal` rather than actions |
| Reducer becomes too complex | Hard to trust conflict behavior | Add small helpers for version checks, reference checks, event changes, and keep compatibility wrapper |
| localStorage size | Markdown content and events exceed browser quota | Cap files; slim events; no content in changes; consider IndexedDB only after V0.2 |
| Event log bloat | Evaluation and persistence slow down | Store changed fields only; cap display; later add archive/export if needed |
| Request race | Old Agent response overwrites Human edits | API returns actions only; runId/stepId discard; client applies to latest state |
| Duplicate Agent steps | Agent repeats evidence/claims | stepId, previous apply results, source processing markers in notes/context |
| Mock Agent trajectory fails | Demo loses stable path | Keep deterministic fallback but make it source-aware in small increments |
| V0.1 Evaluation breaks | Existing proof regresses | Preserve existing metrics and tests; add V0.2 fields additively |
| UI shows too much state | User cannot understand workflow | Top bar shows only status/current goal/latest action/pending decisions; Activity Log secondary |
| Human acknowledgement misclassified | Metrics overstate responsiveness | Use explicit event IDs; distinguish seen vs responded |
| Brief stale false positives | User loses trust in stale banner | Base stale only on version maps for cited/used claims/evidence |
| Brief stale false negatives | Outdated output exported as fresh | Include evidence versions and cited object existence in selector |
| Migration breaks old demo | User loses workspace | Idempotent migration; factory emits V0.2; reset fallback |

## Explicit V0.2 Non-Goals

- WebSocket.
- SSE.
- Redis.
- Backend database.
- Multi-user collaboration.
- Login.
- CRDT.
- Automatic merge.
- Multi-Agent orchestration.
- Vector database.
- RAG pipeline.
- PDF/OCR.
- Live web search.
- LLM-as-a-judge benchmark.
- Source deletion.
- Rich text editor.
- Complex Brief diff.
- Page-refresh automatic Agent resume.

## Recommended First Phase

Start with Phase 1: Versioned Core & Slim Events.

This phase creates the invariant that makes every later V0.2 feature safe: object versions, audit-safe events, and V0.2-native factories. Starting with upload or UI would create state that still cannot reject stale Agent writes.
