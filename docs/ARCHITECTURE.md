# SharedGround Architecture

SharedGround is a single Next.js application that models human-agent collaboration as state transitions over a shared research workspace.

## Core Model

The workspace state lives in `core/types.ts` and contains:

- `task`: the research question, scope, source mode, and creation metadata.
- `sources`: research materials added by the system, human, or agent.
- `evidence`: findings linked to source IDs.
- `notes`: research notes linked to sources and evidence.
- `claims`: analytical claims with evidence IDs, confidence, status, and optional human decision notes.
- `brief`: the final markdown deliverable.
- `events`: the auditable activity log.
- `agentStatus`: `idle`, `working`, `waiting_for_human`, `blocked`, or `completed`.
- `pendingHumanRequest`: an open or answered handoff request.
- `completed`: whether the human has marked the task complete.

This state is the product surface. The UI, mock agent, real-agent route, and evaluation layer all read and write this same object model.

## Structured Actions

All workspace mutations go through typed actions defined in `agent/action-schema.ts` and `core/schemas.ts`.

The action space includes:

- source operations: `ADD_SOURCE`, `EDIT_SOURCE`, `SEARCH_SOURCE`;
- evidence operations: `ADD_EVIDENCE`, `EDIT_EVIDENCE`;
- note operations: `ADD_NOTE`, `EDIT_NOTE`;
- claim operations: `PROPOSE_CLAIM`, `UPDATE_CLAIM`, `CHALLENGE_CLAIM`;
- control handoff: `REQUEST_HUMAN_INPUT`, `ANSWER_HUMAN_INPUT`, `WAIT`;
- deliverable control: `EDIT_BRIEF`, `FINISH`.

Agent turns are validated by Zod and limited to at most three actions. The agent may not emit `ANSWER_HUMAN_INPUT` or `FINISH`.

## Reducer And Permissions

`core/reducer.ts` is the only place where actions become workspace changes. It performs three jobs:

1. checks reducer-level permissions through `core/permissions.ts`;
2. validates referenced object IDs before accepting links;
3. appends an event for every accepted or rejected action.

Important permission rules:

- humans cannot perform agent-only control actions such as `WAIT`;
- agents cannot answer human input requests;
- agents cannot finish the task;
- agents cannot set claim status to `human_confirmed`, `human_revised`, or `final`;
- rejected actions are logged as `ACTION_REJECTED`.

These rules are not only UI affordances. They are enforced in the reducer.

## Controlled Autonomy Loop

The agent is treated as a task participant, not as a chat assistant.

```text
Workspace State
      |
      v
Build Agent Context
      |
      v
Mock Agent or Real Agent API
      |
      v
Validate AgentTurn with Zod
      |
      v
Apply Actions Through Reducer
      |
      v
Updated Workspace + Event Log
```

The loop is implemented across:

- `agent/build-context.ts`;
- `agent/mock-agent.ts`;
- `agent/execute-agent-turn.ts`;
- `app/api/agent/route.ts`;
- `core/reducer.ts`.

If a human request is open, the mock agent emits `WAIT`. If the final framing needs human judgment, it emits `REQUEST_HUMAN_INPUT`. After the human answers, it drafts the brief.

## Mock Agent And Real-Agent Fallback

The mock agent provides a deterministic EU industrial policy demo trajectory. This keeps the demo stable and testable.

The real-agent path is available through `app/api/agent/route.ts` when:

```bash
USE_MOCK_AGENT=false
OPENAI_API_KEY=...
```

The route builds a system prompt, sends a workspace snapshot to an OpenAI-compatible chat completion endpoint, parses JSON, validates the result with Zod, retries once on invalid structure, and falls back to the mock agent if the real call fails.

## UI And Persistence

The UI is split into:

- landing page: demo loading and custom task creation;
- workspace page: sources, evidence, notes, claims, brief, human requests, controls, and activity log;
- evaluation page: outcome, process, traceability, and exports.

`store/workspace-store.ts` uses Zustand with localStorage persistence. This is enough for a V0.1 single-user demo and avoids databases, login, Redis, and WebSockets.

## Evaluation Layer

The evaluation layer lives in `eval/` and measures:

- outcome: completion, final claims, grounded final claims, citation integrity;
- process: agent/human action counts, human revisions, overrides, request effectiveness, waits, unauthorized actions;
- traceability: whether final claims connect to evidence, sources, human decisions, and the brief.

The evaluation page exports:

- `evaluation-summary.json`;
- `evaluation-summary.md`.

These exports make the collaboration process inspectable rather than treating the final brief as the only output.

## Design Constraints

V0.1 intentionally keeps the architecture small:

- no database;
- no multi-user state;
- no WebSocket runtime;
- no external search dependency;
- no vector database;
- no multi-agent framework.

The main architecture bet is that the collaboration protocol matters more than backend scale for this demo: shared state, typed actions, reducer permissions, control handoff, and auditability.
