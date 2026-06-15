# SharedGround V0.1 Project Review

## Product Claim

SharedGround demonstrates that human-agent research collaboration can be designed around shared state rather than chat.

The product does not try to prove that an AI can automatically produce a perfect report. It proves that a human and an agent can work through a visible collaboration loop:

```text
Shared task -> Sources -> Evidence -> Notes -> Claims -> Human decision -> Brief -> Evaluation
```

## Implemented V0.1 Scope

- Landing page with stable demo entry and custom task creation.
- Shared workspace with sources, evidence, notes, claims, final brief, human request, controls, and activity log.
- Core workspace reducer with typed state transitions.
- Reducer-level permission checks for human-only and agent-only actions.
- Mock agent trajectory for stable demo behavior.
- Real-agent API route with OpenAI-compatible endpoint support and mock fallback.
- Human editing of workspace objects.
- Agent recognition of open and answered human requests.
- Claim status workflow.
- Final task completion controlled by the human.
- Evaluation page with outcome, process, and traceability summaries.
- JSON and Markdown evaluation exports.

## What V0.1 Proves

### Shared State

The human and agent operate on one workspace object model. Their changes appear in the same panels and event log.

### Structured Agency

The agent does not write arbitrary UI state. It emits typed actions validated by schema and applied by the reducer.

### Human Authority

The human owns final judgment. The agent cannot answer human requests, cannot complete the task, and cannot assign final/human-confirmed claim statuses.

### Controlled Autonomy

The agent can continue when the next action is clear, request human input when direction is needed, and wait when a request is open.

### Auditability

Events capture accepted and rejected actions. Evaluation exports summarize how the collaboration unfolded.

## Evaluator Checklist

An evaluator should be able to verify:

- the demo starts from a stable EU industrial policy task;
- running the agent changes workspace objects, not a chat transcript;
- claims link back to evidence IDs;
- human edits are possible and visible;
- the agent requests human direction before drafting;
- the agent waits when a request is open;
- the human can complete the task;
- the evaluation page exports JSON and Markdown summaries;
- tests, typecheck, and production build pass.

## Known Limitations

- The default corpus is small and preloaded for demo stability.
- Live web search is not implemented as a blocking V0.1 dependency.
- Custom tasks can be created, but the stable mock trajectory is designed around the built-in EU case.
- There is no authentication or multi-user collaboration.
- localStorage persistence is sufficient for demo use but not for production collaboration.
- The real-agent path depends on an OpenAI-compatible API and falls back to the mock agent on failure.
- Evaluation is deterministic and rule-based; it is not a full research-quality benchmark.
- The UI is functional and intentionally restrained rather than polished as a production SaaS interface.

## Future Work

High-leverage next steps:

- add real source search without weakening the stable demo path;
- make custom tasks produce topic-specific mock trajectories or real-agent source plans;
- add richer evidence-chain visualization;
- add markdown export for the final brief;
- support durable backend storage;
- add multi-user state only after the single-user collaboration loop is proven;
- expand evaluation rules for claim quality, source diversity, and human override handling.

## Final Assessment

SharedGround V0.1 is a complete demo of the intended collaboration mechanism. The strongest part of the project is not the research content itself; it is the explicit product structure around shared state, action permissions, handoffs, and traceable evaluation.
