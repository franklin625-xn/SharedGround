# Phase 9 Docs And Demo Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package SharedGround V0.1 so an evaluator can understand, run, demo, and assess the project.

**Architecture:** This phase does not change runtime behavior. It adds evaluator-facing documentation that explains the shared workspace model, the controlled autonomy loop, evaluation exports, Collaborative Gym attribution, and V0.1 limitations.

**Tech Stack:** Markdown, MIT license text, existing Next.js/TypeScript/Vitest project.

---

## Files

Create:

```text
README.md
docs/ARCHITECTURE.md
docs/OPEN_SOURCE_ATTRIBUTION.md
docs/DEMO_SCRIPT.md
docs/PROJECT_REVIEW.md
LICENSE
```

Modify:

```text
docs/superpowers/plans/2026-06-15-phase-09-docs-packaging.md
```

## Task 1: Baseline Verification

- [x] **Step 1: Confirm branch and clean status**

Run:

```bash
git status --short --branch
```

Expected: working tree is clean before docs are created.

- [x] **Step 2: Run verification before docs**

Run:

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all commands pass before documentation work.

## Task 2: Evaluator Entry Point

- [x] **Step 1: Create README**

Create `README.md` with:

- project positioning;
- why this is not a chatbot;
- local setup and run commands;
- mock-agent default and optional real-agent environment variables;
- demo flow;
- evaluation export instructions;
- V0.1 scope and non-goals.

## Task 3: Architecture Documentation

- [x] **Step 1: Create architecture document**

Create `docs/ARCHITECTURE.md` with:

- shared workspace state shape;
- controlled autonomy loop;
- structured action schema;
- reducer-level permission checks;
- mock and real agent paths;
- local persistence;
- evaluation layer.

## Task 4: Attribution Documentation

- [x] **Step 1: Create open-source attribution**

Create `docs/OPEN_SOURCE_ATTRIBUTION.md` with:

- what SharedGround learned from Collaborative Gym;
- what was not copied;
- what was changed for V0.1;
- how future direct upstream code reuse should preserve license and copyright notices.

## Task 5: Demo And Review Package

- [x] **Step 1: Create demo script**

Create `docs/DEMO_SCRIPT.md` with a timed walkthrough:

- start demo;
- run agent;
- inspect sources/evidence/notes;
- review claims;
- answer human request;
- draft brief;
- complete task;
- export evaluation.

- [x] **Step 2: Create project review**

Create `docs/PROJECT_REVIEW.md` with:

- what V0.1 proves;
- implemented phases;
- evaluator checklist;
- limitations and future work.

- [x] **Step 3: Create license**

Create `LICENSE` with the MIT License for this repository.

## Task 6: Final Verification

- [x] **Step 1: Run final verification**

Run:

```bash
npm run typecheck
npm run test
npm run build
```

Expected: all commands pass after docs are added.

- [x] **Step 2: Inspect git diff**

Run:

```bash
git diff --stat
git status --short
```

Expected: only Phase 9 documentation and license files are changed.

- [x] **Step 3: Commit**

Run:

```bash
git add README.md docs/ARCHITECTURE.md docs/OPEN_SOURCE_ATTRIBUTION.md docs/DEMO_SCRIPT.md docs/PROJECT_REVIEW.md docs/superpowers/plans/2026-06-15-phase-09-docs-packaging.md LICENSE
git commit -m "docs: package sharedground demo"
```

Expected: commit succeeds.
