---
name: test-functional
description: "TestForge Functional & Regression Testing skill: designs, writes, and executes unit, integration, E2E, boundary/negative-input, state-transition, and regression test suites across Next.js/React, Flutter/React Native, Node/Python/Spring Boot, and Firebase. Follows Option A (auto-fix own new test syntax errors; report app defects in docs/qa/TEST_FORGE_REPORT.md and await user approval)."
---

# TestForge — Functional & Regression Testing (`test-functional`)

Use this skill to verify that every feature satisfies functional requirements, handles negative and boundary inputs cleanly, and introduces zero regressions across existing modules.

---

## 1. Functional Testing Targets (Black-Box Rigor)

For every feature or module under test, verify all four functional pillars:
1. **Allowed Inputs:** Every valid input format, business scenario, and happy path produces the exact expected output.
2. **Rejected / Negative Inputs:** Invalid types, empty/null strings, negative quantities, out-of-range numbers, malformed IDs, and unauthorized callers are cleanly rejected with proper error codes.
3. **All System Outputs:** Return values, HTTP status codes, JSON shapes, DB state changes, emitted events, and UI states match specifications.
4. **State Transitions:** Full lifecycle transitions (e.g., `DRAFT → PENDING → PAID → REFUNDED`, rejecting illegal jumps like `DRAFT → REFUNDED`).

---

## 2. Stack-Specific Execution Commands

- **Web (Next.js / React):**
  - Type check: `npx tsc --noEmit`
  - Unit/Component: `npx vitest run` or `npx jest`
  - E2E: `npx playwright test` (or `npx cypress run`)
- **Mobile (Flutter / React Native):**
  - Flutter: `flutter analyze && flutter test`
  - React Native: `npx tsc --noEmit && npx jest`
- **Backend — Node.js:** `npm test` / `node --test` / `npx vitest run` / `npx jest`
- **Backend — Python (FastAPI / Django / Flask):** `pytest -v` (or `python manage.py test`) + `ruff check` / `mypy` if configured
- **Backend — Spring Boot:** `./mvnw test` or `./gradlew test`
- **Firebase:** `firebase emulators:exec --only firestore,auth "<test-command>"`

*(Read-only SpecForge Synergy: if `docs/01_PRD.md`, `docs/04_API.md`, or `docs/08_TESTS.md` exist, derive test cases directly from their acceptance criteria!)*

---

## 3. Regression Strategy

Whenever existing code was modified:
1. Identify all direct callers, shared utilities, database models, and dependent modules of the changed files.
2. Run the targeted regression suite covering those areas PLUS the full unit/integration test suite.
3. When fixing an approved bug, ALWAYS write a **failing regression test first** that reproduces the bug, then apply the fix, then re-run to prove permanent resolution.

---

## 4. Option-A Enforcement & Report

- Auto-fix syntax/type errors ONLY in brand-new code/tests you just authored.
- If tests reveal a **real application defect or regression**, DO NOT silently alter business logic or weaken assertions:
  1. Log findings (`FUNC-01`, `REG-01`, ...) in **`docs/qa/TEST_FORGE_REPORT.md`**.
  2. Summarize pass/fail metrics and failures in chat.
  3. Ask the user for approval before fixing production code.
