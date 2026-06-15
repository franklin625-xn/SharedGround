# SharedGround V0.2 Demo Script

7-10 minute evaluator demo covering the continuous action protocol.

## Setup

```bash
npm install && npm run dev
# → http://localhost:3000
# USE_MOCK_AGENT=true (default)
```

## Narrative Hook

> SharedGround V0.2 proves that a human and an agent can work on the same shared workspace continuously — not in isolated turns. The human can edit, upload, and send messages while the agent is running. Stale writes are rejected. The Brief detects when it's out of date.

## Walkthrough

### 1. Start Demo

Landing page → **Start Demo**. Default EU industrial policy corpus loads.

### 2. Agent Step Loop

Click **▶ Start**. The agent begins a multi-step research pass:

- Step 1: adds source + evidence + note
- Step 2: proposes claims
- Step 3: requests human direction

Point out the status bar shows the current goal and step progress.

### 3. Human Edit During Run

While the agent is running, **edit a source** or **revise a claim**. Show that:

- The human edit applies immediately.
- The agent re-reads the latest workspace on its next step.
- The activity log records both human and agent events interleaved.

### 4. Stale Write Rejection

Click **⏸ Pause**, then edit the same claim again (version increments). Click **▶ Resume**. The agent may try to update with the old version. Show:

- An `ACTION_REJECTED` event with rejection code `STALE_OBJECT_VERSION` in the activity log.
- The agent re-reads and continues with the current version.

### 5. Teammate Messages

Open the right-side **Messages** tab, type "Focus on EV batteries please" and click **Send**. Show:

- Message appears with `pending` status.
- A `SEND_TEAMMATE_MESSAGE` event is created.
- Click **Send & Run** for a second message to trigger exactly one agent step.
- Agent replies with a visible `REPLY_TEAMMATE_MESSAGE` and uses structured actions for actual workspace changes.

### 6. Markdown Upload

Click **Upload .md** and select 1-3 markdown files. Show:

- Each file becomes a source with `contentHash` and `lineCount`.
- Evidence can now reference line ranges (startLine/endLine).
- Uploading identical Markdown shows "This file is identical to an existing source" and offers **Skip** or **Replace existing**.

### 7. Human Input Request

Continue running. Agent asks for direction. Answer the request. Agent drafts the Brief.

### 8. Brief Derivation & Stale Detection

Show:

- Brief displays "Based on N claims, M evidence — drafted by agent".
- Claims cited in the Brief show **📝 Brief** markers.
- **Edit a reviewed claim** (change its status or statement).
- The Brief now shows **⚠ Brief may be out of date** banner.

### 9. Complete & Evaluate

**Complete Task** → **View Evaluation**. Show V0.2 metrics:

- Stale write rejections count.
- Human message acknowledgement rate.
- Source location completeness.
- Accepted agent action rate.
- Brief stale detection.
- Human revision resolution rate.
- Duplicate source attempts.

Export as JSON/Markdown, then use **Export Debug Bundle** from the workspace header to inspect storage diagnostics.

### 10. Closing

> V0.2 upgrades SharedGround from round-based state replacement to a browser-owned continuous action protocol. Human edits always win, stale Agent writes are detected, Brief freshness is computable, and the collaboration process is auditable with version-level granularity.

## Failure-Safe

- Real API fails → mock agent fallback with banner.
- localStorage quota failure → current memory state remains active; export a Debug Bundle, then reset or clean old audit data.
- Page refresh during run → agent status shows "paused"; click **▶ Resume**.
