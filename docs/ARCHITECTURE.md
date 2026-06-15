# SharedGround Architecture

SharedGround is a single Next.js application that models human-agent collaboration as versioned state transitions over a shared research workspace.

## Core Model (V0.2)

The workspace state lives in `core/types.ts`:

- `task` — research question, scope, source mode.
- `sources` — research materials with version, content hash, line count.
- `evidence` — findings with source version/hash anchors and line ranges.
- `notes` — research notes linked to sources and evidence.
- `claims` — analytical claims with evidence, status workflow, version.
- `brief` — final markdown deliverable with derivation metadata.
- `messages` — non-blocking teammate messages with pending/read/resolved/blocked status.
- `events` — slim auditable activity log with version diffs.
- `agentControl` — run/step lifecycle, acknowledged Human events, stale discard count.

All domain objects carry `VersionedMetadata` (version, createdAt, updatedAt, createdBy, updatedBy).

## V0.2 Continuous Action Protocol

```
Browser Workspace Store
  → Human actions immediately apply through reducer
  → Agent loop calls /api/agent-step with latest snapshot
  → API returns AgentTurn / proposed actions only (no state)
  → Browser applies each action against latest local state
  → Reducer accepts, rejects (STALE_OBJECT_VERSION), or rejects (BRIEF_CLAIM_UNREVIEWED)
  → Agent receives apply results and re-reads latest state
  → Loop continues, pauses, waits for human, completes, or errors
```

Key invariants:
- The API never returns an authoritative replacement `WorkspaceState`.
- Agent updates on existing objects must include `expectedVersion`.
- Human actions do not require `expectedVersion` and always win.
- Source content is immutable; events never contain full source content.

## Action Space

All workspace mutations go through typed, Zod-validated actions:

- Source: `ADD_SOURCE`, `EDIT_SOURCE`, `SEARCH_SOURCE`
- Evidence: `ADD_EVIDENCE`, `EDIT_EVIDENCE`
- Notes: `ADD_NOTE`, `EDIT_NOTE`
- Claims: `PROPOSE_CLAIM`, `UPDATE_CLAIM`, `CHALLENGE_CLAIM`
- Control: `REQUEST_HUMAN_INPUT`, `ANSWER_HUMAN_INPUT`, `WAIT`
- Deliverable: `EDIT_BRIEF`, `FINISH`
- V0.2 messages: `SEND_TEAMMATE_MESSAGE` (Human-only), `REPLY_TEAMMATE_MESSAGE`, `MARK_MESSAGE_READ`, `RESOLVE_TEAMMATE_MESSAGE`

Agent turns capped at 3 actions. Agent may not emit `ANSWER_HUMAN_INPUT`, `FINISH`, or `SEND_TEAMMATE_MESSAGE`.

## Reducer And Permissions

`core/reducer.ts` is the only mutation point:

1. Checks permissions through `core/permissions.ts`.
2. Validates `expectedVersion` for Agent updates → `STALE_OBJECT_VERSION`.
3. Prevents Agent claim regression → `AGENT_STATE_REGRESSION`.
4. Validates Agent Brief derivation → `BRIEF_CLAIM_UNREVIEWED`.
5. Validates reference IDs, evidence line ranges, content immutability.
6. Records slim events with version diffs and rejection codes.

New events never persist full `WorkspaceState`, `Source.content`, `before`, `after`, `legacyBefore`, or `legacyAfter`. Compatibility fields may be read during migration, but persist cleanup drops them.

Markdown sources are deduplicated by `contentHash`. Identical uploads are rejected with `DUPLICATE_SOURCE`; same filename with different content is treated as a trackable new version/upload.

## Agent Step Loop

`store/workspace-store.ts` owns the step loop:

- `startAgent()` → creates `runId`, sets status to `running`.
- `pauseAgent()` → aborts fetch via per-step `AbortController`, invalidates run.
- `resumeAgent()` → creates fresh `runId` from latest workspace.
- `runAgentStep()` → fetch `/api/agent-step` → stale check (runId/stepId match BEFORE JSON parse) → apply actions via `applyWorkspaceActionWithResult` → route stop reason.
- `scheduleNextStep()` → `setTimeout(0)` to allow React re-render between steps.
- `partialize` clears `activeRunId`/`activeStepId` and old audit snapshots before localStorage persist.
- localStorage `QuotaExceededError` is caught by the safe storage wrapper; current in-memory state remains active and the UI offers Debug Bundle export.

## Brief Derivation And Stale Detection

`core/brief-stale.ts` provides pure selectors:

- `briefIsStale(state)` — checks derivation claim/evidence versions against current state.
- `briefStaleReason(state)` — human-readable reason.
- Stale = any cited claim/evidence deleted, version changed, or claim regressed from human-reviewed.

Agent must include derivation metadata when drafting Brief. Reducer rejects Briefs citing `ai_proposed`, `contested`, or `evidence_insufficient` claims.

## Evaluation Layer (V0.1 + V0.2)

V0.1 metrics: outcome (grounded claims, citation integrity), process (human override rate, request effectiveness), traceability (evidence chain completeness).

V0.2 metrics: stale write rejections, repeated stale writes, duplicate source attempts, human message acknowledgement/resolution rates, agent replies without supporting action, human revision resolution rate, accepted agent action rate, source location completeness, Brief stale detection, discarded stale responses.

## Debug Bundle

The workspace header provides **Export Debug Bundle**, producing `sharedground-debug-bundle.json` with task, objects, slim events, messages, evaluation summary, runtime mode, and storage diagnostics:

```
totalBytes, sourcesBytes, eventsBytes, evidenceBytes, notesBytes,
claimsBytes, briefBytes, messagesBytes
```

The bundle intentionally stores Markdown content only in `sources`; events, messages, derivation metadata, and runtime diagnostics do not duplicate source bodies.

## Design Constraints

Explicitly excluded: WebSocket, SSE, Redis, database, multi-user, login, CRDT, auto-merge, vector search, RAG, PDF/OCR, live web search, multi-agent, source deletion, page-refresh auto-resume.
