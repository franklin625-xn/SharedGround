# SharedGround Demo Script

This walkthrough is designed for a 5-7 minute evaluator demo.

## Setup

Run:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Use the default mock-agent mode for the most stable demo:

```bash
USE_MOCK_AGENT=true
```

## Demo Narrative

Position the project in one sentence:

> SharedGround is not a chatbot. It is a shared research workspace where the agent changes visible research objects, asks for human judgment at the right time, and leaves an auditable trail.

## Walkthrough

### 1. Start The Demo

On the landing page, click **Start Demo**.

Point out:

- the default task is about EU industrial policy and Chinese investment in Europe;
- this is a stable corpus for demonstration;
- a custom task can be created, but broad live search is outside V0.1.

### 2. Show The Empty Shared Workspace

On `/workspace`, identify the main regions:

- sources, evidence, and notes on the left;
- claims and final brief in the center;
- activity log on the right;
- agent controls and status in the top bar.

Explain that the agent and human are not chatting. They are operating on these shared objects.

### 3. Run Agent: Initial Research Pass

Click **Run Agent** once.

Expected result:

- the agent adds a synthesized source;
- the agent extracts evidence;
- the agent writes a research note;
- the activity log records the actions.

Evaluation point:

> The agent is not producing a hidden answer. It is making state changes that the human can inspect and edit.

### 4. Run Agent: Claim Proposal

Click **Run Agent** again.

Expected result:

- the agent proposes reviewable claims;
- claims include evidence links and confidence;
- claim status starts as `ai_proposed`.

Evaluation point:

> Claims are not final. The human remains responsible for confirmation, revision, contesting, or finalization.

### 5. Human Review

Open a claim and revise or confirm it.

Good demo actions:

- mark one claim as human confirmed;
- revise one claim with a human decision note;
- optionally contest a claim if counter-evidence is available.

Point out that these changes become events. The activity log records human authority, not just agent output.

### 6. Run Agent: Human Direction Request

Click **Run Agent** again.

Expected result:

- the agent asks which final-brief emphasis to use;
- the request appears as a human input banner;
- the agent status becomes `waiting_for_human`.

Evaluation point:

> The agent does not guess when the next step requires a human framing decision.

### 7. Show Wait Behavior

Before answering the request, click **Run Agent** again.

Expected result:

- the agent waits;
- no brief is drafted;
- the log records the wait.

Evaluation point:

> Controlled autonomy means knowing when not to act.

### 8. Answer The Human Request

Answer:

```text
Focus the final brief on EV batteries and localization strategy.
```

Expected result:

- the request becomes answered;
- the event log records the human answer.

### 9. Run Agent: Draft Brief

Click **Run Agent** again.

Expected result:

- the agent drafts a final brief;
- the brief includes the human-selected direction;
- the brief remains editable by the human.

Point out that this is the first moment where a report-like artifact appears, after shared sources, evidence, notes, claims, and a human control handoff already happened.

### 10. Complete And Evaluate

Click **Complete Task**, then **View Evaluation**.

Show:

- outcome metrics;
- collaboration process metrics;
- traceability metrics.

Export:

- `evaluation-summary.json`;
- `evaluation-summary.md`.

Evaluation point:

> The project evaluates the collaboration process, not only the final prose.

## Failure-Safe Notes

If a real model call fails, the app falls back to the mock agent and shows an agent fallback banner. Continue the demo with the mock trajectory.

If localStorage contains an old state, use **Reset** or return to the landing page and click **Start Demo** again.

## Closing Summary

End with:

> V0.1 proves the collaboration loop: shared workspace, structured agent actions, human edits, explicit request/wait handoff, final brief, and evaluation exports. It does not try to prove broad autonomous research or production infrastructure.
