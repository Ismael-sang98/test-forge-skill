---
name: test-smoke-sanity
description: "TestForge Smoke & Sanity Testing skill: runs ultra-fast post-build Smoke Tests (verifying critical functions, app boot, and core routes) and targeted post-fix Sanity Tests (verifying a specific change works without full deep regression). Used automatically after builds and small fixes."
---

# TestForge — Smoke & Sanity Testing (`test-smoke-sanity`)

Use this skill for fast, high-signal verification after every build, integration, or targeted bug fix.

---

## 1. Smoke Testing (*Duman Testi / Test de Fumée*) — Post-Build

**Goal:** Prove in `< 60 seconds` that the build is alive and critical user/system paths are not broken before investing in heavier test suites.

### Checklist
1. **Clean Compile / Type Check:** Project compiles or type-checks without fatal errors.
2. **Application Boot:** App starts cleanly without uncaught startup exceptions or missing required env vars.
3. **Critical Paths Only (3–5 Vital Flows):**
   - **Web / Next.js:** Home/landing route renders (`200`), auth guard redirects protected route, main API health route responds.
   - **Backend / API:** Health endpoint (`/health` or `/actuator/health`), DB connection check, 1 authenticated read + 1 validated write flow.
   - **Mobile (Flutter / RN):** App widget/root component mounts in test harness without layout overflow or crash (`flutter test` smoke widget test / Jest root render test).
   - **Firebase:** Rules compile cleanly (`firebase emulators` syntax check) and Cloud Functions export cleanly.

**Verdict:** If a Smoke Test fails, immediately mark the build **`REJECTED`** — do not waste time running full E2E or load suites until the blocker is resolved.

---

## 2. Sanity Testing (*Mantıklılık Testi / Test de Cohérence*) — Post-Bugfix

**Goal:** After a narrow, targeted code change or bug fix, verify specifically that:
1. The exact reported defect or modified behavior now works as expected.
2. Its immediate neighboring logic did not break.
3. Deep unrelated subsystem analysis is intentionally skipped to stay fast.

---

## 3. Option-A Reporting
- Auto-fix only trivial syntax/import errors in new code you just wrote during the current task.
- Record Smoke/Sanity pass/fail status in **`docs/qa/TEST_FORGE_REPORT.md`** and summarize in chat. If a pre-existing failure or security issue surfaces, await user approval before modifying unrelated code.
