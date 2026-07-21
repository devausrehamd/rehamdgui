# Changelog

All notable changes to the QMS GUI (`rehamdgui`) are recorded here. This project
adheres to [Semantic Versioning](https://semver.org) and the commit history
follows [Conventional Commits](https://www.conventionalcommits.org).

## 0.2.0 — 2026-07-21

### Features

- **feat(gui): Ask the orchestrator page** — submit a question to the Talk Agent
  (`POST /api/v1/orchestrator/ask`) under the selected agent, and see the chosen
  capability (with its confidence), the orchestrated answer, and the session
  correlation id (agent-platform Stage 5).

## 0.1.0

- Thin web client for the QMS stack: ID Server sign-in with a per-session token,
  agent selection from Discovery, rubric list + structured editor, k-sampling
  batch steering, runs, and review.
