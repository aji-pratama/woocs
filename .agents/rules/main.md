---
trigger: always_on
---

# WooCS.ai — Global Project Rules (Meta-Governance)

## 1. Source of Truth
- **Architecture**: `.agents/AGENTS.md` is the **SOLE** reference for technical invariants (runtime model, port map, Django apps, auth model).
- **Backend code**: All Django logic lives in `./backend/` — structured by app (`stores`, `sync`, `catalog`, `chat`).
- **Plugin code**: All WP plugin logic lives in `./plugin/`.
- **Widget code**: All React/Vite code lives in `./widget/`.

## 2. Core Directives
- **Check Plan**: Always check `.agents/plan.md` at the start of any session.
- **Update Plan**: Update `.agents/plan.md` immediately after completing any task, subtask, or bug fix. Mark items `[x]`.
- **PRD is law**: `.docs/PRD_v0.md` defines features, data models, API contracts, and integration flows. Do not deviate without explicit user instruction.
- **No container rebuilds**: Backend and widget changes are hot-reloaded. Never ask the user to restart containers for PHP/Python/JS/CSS changes.
- **TDD**: Write tests before implementing feature code.

## 3. Development Workflow (SOP)
1. **Check Plan** → `.agents/plan.md` is the root source of truth.
2. **Feature Plan** → For large features, create `.agents/plan_<feature>.md` with an actionable checklist and specific file paths.
3. **Execute** → Code directly in `./backend/`, `./plugin/`, or `./widget/`. Infrastructure is managed via `make infra-up`.
4. **State Management** → If a feature introduces new Django models or migrations, instruct the user to run `make db-dump` after migrating.

## 4. Changelog & Archival Rules
- **When a section in `.agents/plan.md` is fully completed** (all items `[x]`), move the entire section to `.agents/artifacts/changelog.md`.
- Preserve section heading and all `[x]` items as-is.
- Never delete completed items from `.agents/plan.md` without archiving first.

## 5. Communication & Execution
- **Output**: Code-only focused. Minimal chatter. Use complete, runnable blocks.
- **Language**: All code (variables, functions, strings, comments) strictly in **English**.
- **Context rules**: Detailed rules per layer load from `.agents/rules/backend.md`, `.agents/rules/plugin.md`, `.agents/rules/widget.md`.