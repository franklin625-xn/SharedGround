# SharedGround

SharedGround is a lightweight shared research workspace for humans and AI agents. It proves one product idea:

> Humans and agents should work on the same visible task state, exchange control at explicit moments, and leave an auditable trail of evidence, decisions, and edits.

## V0.2: Continuous Action Protocol

V0.2 upgrades the collaboration model from round-based state replacement to a **browser-owned continuous action protocol**:

- **Agent works in small steps.** Each step rereads the latest workspace, proposes actions, and the browser applies them locally.
- **Human always wins.** Human edits apply immediately. If the Agent tries to update a stale object, the reducer rejects with `STALE_OBJECT_VERSION`.
- **Versioned objects.** Every source, evidence, note, claim, and the brief has version metadata. Version mismatches are detected and rejected.
- **Brief derivation.** Agent-drafted Briefs record which claim/evidence versions were used. The system marks the Brief stale when underlying data changes.
- **Non-blocking human messages.** Humans can send direction signals without creating a blocking request.
- **Stale response discard.** Pause terminates the current run. Old API responses are discarded by runId/stepId.
- **Markdown upload.** Humans can upload `.md` files as research sources with content hashing and line-level evidence.
- **Evaluation V0.2.** Metrics for stale write rejections, human message acknowledgement, source location completeness, accepted agent action rate, and Brief staleness.

## What It Demonstrates

- Human and Agent share one workspace state.
- Agent advances work through structured, versioned actions.
- Human can directly edit, upload, and message while Agent runs.
- Agent re-reads latest state after Human edits.
- Reducer rejects stale Agent writes and unreviewed-claim citations.
- Activity log records accepted and rejected actions with version metadata.
- Evaluation summarizes outcome, process, traceability, and V0.2 safety metrics.

## Run Locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run typecheck
npm run test
npm run build
```

## Agent Modes

Mock agent (default, no API key needed):

```bash
USE_MOCK_AGENT=true
```

Real agent (requires `.env.local`):

```bash
USE_MOCK_AGENT=false
OPENAI_API_KEY=***
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

## Demo Flow (V0.2)

1. **Start Demo** from the landing page.
2. Click **▶ Start** to begin the agent step loop.
3. Watch the agent add sources, evidence, notes, and propose claims.
4. **Edit a claim** while the agent is running — the agent re-reads and adapts.
5. Click **⏸ Pause** to stop execution; **▶ Resume** to continue.
6. Use **💬** to send a non-blocking message to the agent.
7. Upload `.md` files as research sources.
8. Answer the human input request when prompted.
9. Review the Brief; verify claims show "📝 Brief" markers.
10. Edit a reviewed claim — check that the Brief now shows a ⚠ stale warning.
11. **Complete Task** → **View Evaluation** → export JSON/Markdown.

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a detailed walkthrough.

## Project Structure

```text
app/                    Next.js routes and API (agent + agent-step)
agent/                  action schema, context builder, mock agent, system prompt
core/                   types, reducer, permissions, event factory, brief-stale selector
components/             workspace and evaluation UI
data/                   stable demo task and source corpus
eval/                   outcome, process, and traceability evaluation (V0.1 + V0.2)
store/                  Zustand localStorage-backed workspace store + agent step loop
tests/                  Vitest coverage (125 tests)
docs/                   architecture, demo script, attribution, project review
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Open Source Attribution](docs/OPEN_SOURCE_ATTRIBUTION.md)
- [Project Review](docs/PROJECT_REVIEW.md)

## Boundaries

V0.2 intentionally excludes: multi-user, login, database, Redis, WebSocket, SSE, CRDT, vector search, RAG, PDF/OCR, live web search, multi-agent orchestration, and production deployment.
