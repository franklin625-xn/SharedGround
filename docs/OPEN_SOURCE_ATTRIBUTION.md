# Open Source Attribution

SharedGround V0.1 is conceptually inspired by Collaborative Gym, a research framework for human-agent collaboration environments.

## What SharedGround Borrowed Conceptually

SharedGround adapts these ideas at the product-demo level:

- a shared workspace where human and agent operate on common state;
- a task environment rather than a free-form chat transcript;
- structured action space for agent operations;
- separation between human authority and agent autonomy;
- explicit request/wait control handoff;
- activity logs for collaboration traceability;
- evaluation of collaboration process, not only final answer quality.

## What SharedGround Did Not Copy

This repository does not vendor or fork Collaborative Gym source code.

SharedGround V0.1 does not copy its runtime architecture, including:

- Redis-backed coordination;
- FastAPI services;
- WebSocket orchestration;
- multiple research environments;
- multi-process agent execution;
- full benchmark harnesses.

The implementation here is a lightweight Next.js/TypeScript demo built around a local reducer, Zustand localStorage persistence, a deterministic mock agent, and optional OpenAI-compatible real-agent fallback.

## What SharedGround Changes

SharedGround turns the collaboration-environment idea into a portfolio product prototype:

- one visible research workspace instead of a benchmark suite;
- a fixed demo corpus for stable evaluation;
- typed reducer actions instead of external environment tooling;
- reducer-level permission checks for human-only and agent-only capabilities;
- an evaluator-facing UI and exportable summaries.

## License Handling

Because no Collaborative Gym code is copied into this repository, the repository license is the MIT License in `LICENSE`.

If future versions directly copy, adapt, or vendor Collaborative Gym source files, those files must preserve the upstream license text and copyright notices exactly as required by the upstream license.

## Attribution Statement

SharedGround's shared workspace, structured action, human-agent role separation, controlled autonomy, and process-evaluation framing are inspired by Collaborative Gym. The code in this repository is an independent lightweight implementation for a V0.1 demo.
