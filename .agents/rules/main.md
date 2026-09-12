---
trigger: always_on
---

# WooCS.ai — Global Project Rules (Meta-Governance)

## 1. Source of Truth
- **Architecture**: `.agents/AGENTS.md` is the **SOLE** reference for technical invariants (runtime model, port map, Django apps, auth model).
- **Agent behavior**: `.agents/` contains only durable instructions and path-scoped rules. Do not store plans, task status, changelogs, notes, or generated artifacts here.
- **Documentation**: `_docs/` contains the PRD, plans, project history, and other evolving project knowledge.
- **Backend code**: All Django logic lives in `./backend/` — structured by app (`stores`, `sync`, `catalog`, `chat`).
- **Plugin code**: All WP plugin logic lives in `./plugin/`.
- **Widget code**: All React/Vite code lives in `./widget/`.

## 2. Core Directives
- **Check Plan**: Always check `_docs/plans/roadmap.md` and any relevant feature plan at the start of a session.
- **Update Plan**: Update the relevant file under `_docs/plans/` immediately after completing any task, subtask, or bug fix. Mark items `[x]`.
- **PRD is law**: `_docs/PRD.md` defines features, data models, API contracts, and integration flows. Do not deviate without explicit user instruction.
- **No container rebuilds**: Backend and widget changes are hot-reloaded. Never ask the user to restart containers for PHP/Python/JS/CSS changes.
- **TDD & End-to-End Verification**: ALWAYS start any new feature or bugfix by writing failing unit/contract tests (TDD). NEVER mark a task as completed without running the test suite to verify the changes (`make test-all`). This ensures all layers (API, Widget, Plugin) remain in sync and proper.

## 3. Development Workflow (SOP)
1. **Check Plan** → `_docs/plans/roadmap.md` is the project-level source of truth.
2. **Feature Plan** → For large features, create `_docs/plans/<feature>.md` with an actionable checklist and specific file paths.
3. **Execute (TDD-first)** → Start by writing tests. Implement the code directly in `./backend/`, `./plugin/`, or `./widget/`. Always end the session by verifying your changes pass the test suite. Infrastructure is managed via `make infra-up`.
4. **State Management** → If a feature introduces new Django models or migrations, instruct the user to run `make db-dump` after migrating.

## 4. Changelog & Archival Rules
- **When a section in `_docs/plans/roadmap.md` is fully completed** (all items `[x]`), move the entire section to `_docs/CHANGELOG.md`.
- Preserve section heading and all `[x]` items as-is.
- Never delete completed items from a plan without archiving them first.

## 5. Communication & Execution
- **Output**: Code-only focused. Minimal chatter. Use complete, runnable blocks.
- **Language**: All code (variables, functions, strings, comments) strictly in **English**.
- **Context rules**: Detailed rules per layer load from `.agents/rules/backend.md`, `.agents/rules/plugin.md`, `.agents/rules/widget.md`.
