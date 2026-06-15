# SharedGround

SharedGround is a lightweight shared research workspace for humans and AI agents. It is built to demonstrate one product idea:

> Humans and agents should work on the same visible task state, exchange control at explicit moments, and leave an auditable trail of evidence, decisions, and edits.

This is not a chatbot and not a one-shot report generator. The agent does not just answer in a transcript. It operates through typed actions that mutate shared workspace objects: sources, evidence, notes, claims, human input requests, and the final brief.

## What V0.1 Demonstrates

- A human and an agent share one workspace state.
- The agent advances work through structured actions.
- The human can directly edit sources, evidence, notes, claims, and the brief.
- The agent can request human direction and wait instead of guessing.
- The reducer enforces permissions, so the agent cannot answer human requests or finalize claims.
- The activity log records accepted and rejected actions.
- The evaluation page summarizes outcome quality, collaboration process, and traceability.

## Why It Is Not A Chatbot

Chatbots hide collaboration inside a message stream. SharedGround exposes collaboration as workspace state:

```text
Sources -> Evidence -> Notes -> Claims -> Human Decisions -> Final Brief
```

The important object is not a reply. It is the evolving state of the research task, including who changed what, which evidence supports which claim, and where the agent handed control back to the human.

## Run Locally

Requirements:

- Node.js 20 or newer
- npm

Install and run:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Useful checks:

```bash
npm run typecheck
npm run test
npm run build
```

## Agent Modes

The stable demo uses the mock agent by default:

```bash
USE_MOCK_AGENT=true
```

To try the real-agent fallback path, create `.env.local` from `.env.example` and set:

```bash
USE_MOCK_AGENT=false
OPENAI_API_KEY=sk-your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

If the real call fails or the API key is missing, the app falls back to the mock agent so the demo remains runnable.

## Demo Flow

1. Open the landing page and choose **Start Demo**.
2. In the workspace, click **Run Agent**.
3. Inspect the new source, evidence, note, and activity log entries.
4. Click **Run Agent** again to let the agent propose claims.
5. Review or revise the claims as the human.
6. Click **Run Agent** again. The agent should request a human direction choice.
7. Answer the request.
8. Click **Run Agent** again. The agent drafts the final brief.
9. Edit or confirm claims, complete the task, and open **View Evaluation**.
10. Export `evaluation-summary.json` or `evaluation-summary.md`.

See [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) for a timed walkthrough.

## Project Structure

```text
app/                    Next.js routes and API route
agent/                  action schema, context builder, mock agent, real-agent call path
core/                   workspace types, reducer, permissions, event factory
components/             workspace and evaluation UI
data/                   stable demo task and source corpus
eval/                   outcome, process, and traceability evaluation
store/                  Zustand localStorage-backed workspace store
tests/                  Vitest coverage for core, agent, UI helpers, and evaluation
docs/                   architecture, attribution, demo, and project review
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Demo Script](docs/DEMO_SCRIPT.md)
- [Open Source Attribution](docs/OPEN_SOURCE_ATTRIBUTION.md)
- [Project Review](docs/PROJECT_REVIEW.md)

## V0.1 Boundaries

SharedGround V0.1 intentionally does not attempt multi-user collaboration, login, databases, Redis, Docker, FastAPI, vector search, broad web search, long-term memory, multi-agent orchestration, or production deployment hardening.

The default EU industrial policy case is a stable demo corpus, not the boundary of the product idea. The product claim is the collaboration model: shared state, structured actions, controlled autonomy, human authority, and traceable work.
