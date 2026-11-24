---
name: test-auto
description: "TestForge master orchestrator: auto-detects the project stack (Next.js/React, Flutter/React Native, Node/Python/Spring Boot, Firebase, Docker, etc.), selects every applicable QA and security test suite, dispatches test-qa-runner and test-red-team subagents in parallel (or runs sequentially in single-agent IDEs), saves docs/qa/TEST_FORGE_REPORT.md, summarizes in chat, and awaits user approval before applying fixes."
---

# TestForge — Full Autonomous QA & Security Orchestrator (`test-auto`)

Use this skill whenever the user asks for a full project test, security audit, pre-release check, or says *"teste et sécurise mon projet"*, *"use test-auto"*, or *"audit complet"*.

---

## Step 1 — Auto-Detect Project Stack & Build the Adaptive Test Matrix

If the session profile was not already injected, run the first available detector path:
```bash
node ~/.gemini/config/plugins/test-forge/scripts/detect-project.mjs --cli . --json 2>/dev/null \
  || node ~/.agents/test-forge/scripts/detect-project.mjs --cli . --json 2>/dev/null \
  || node ~/.claude/test-forge/scripts/detect-project.mjs --cli . --json
```
*(If running without global scripts installed, inspect `package.json`, `pubspec.yaml`, `pyproject.toml`, `pom.xml`, `build.gradle`, `firebase.json`, and `Dockerfile` directly.)*

Optionally check (read-only!) if `docs/01_PRD.md`, `docs/04_API.md`, `docs/08_TESTS.md`, `docs/09_RBAC.md`, or `docs/PROD_CONFIG.md` exist. Never fail if absent.

Automatically map detected stacks to the active test matrix:
- **Always On:** Build/Type Check + `test-smoke-sanity` + `test-functional` (Unit/Integration/Regression) + `test-security` (SAST + Secrets + CVE + Auth/OWASP)
- **Web (Next.js / React / Vue):** + XSS/CSRF/CSP headers + Server Actions auth + Playwright/E2E
- **Mobile (Flutter / React Native):** + Mobile storage/cleartext/deeplink security + `test-parity` (iOS/Android consistency) + `test-resilience` (install/build)
- **Backend (Node / Python / Spring Boot / Go):** + IDOR/RBAC/SQLi/Rate-limit + local DAST mini-pentest + `test-performance` (Load/Stress scripts) + `test-resilience` (DB failure/recovery)
- **Firebase:** + `firestore.rules` & `storage.rules` audit + Cloud Functions auth + Emulator tests
- **Migration / Rewrite detected or requested:** + `test-parity` (Parallel/Audit exact output comparison)

---

## Step 2 — Execute QA & Red-Team Suites (Parallel Subagents or Sequential Fallback)

### Mode A — Multi-Agent IDEs (Antigravity, Claude Code with subagents)
Launch **both subagents in parallel** for speed and zero bias:
1. **`test-red-team`**: Deep 4-layer security audit (SAST + CVE + Stack/RBAC/Firebase + Local DAST PoCs). Strictly read-only on production code.
2. **`test-qa-runner`**: Build/type check + Smoke/Sanity + Functional/Regression tests (+ Performance/Resilience/Parity if applicable).

Wait for both subagents to finish, then merge their results.

### Mode B — Single-Agent IDEs (Codex, Cursor, Windsurf, CLI)
Execute sequentially with the same rigor:
1. Run `test-smoke-sanity` and `test-functional` checks.
2. Run `test-security` (including `static-sec-scan.mjs` + CVE audit + deep manual Red-Team review + local DAST probes where possible).
3. Run applicable stack extras (`test-performance`, `test-parity`, `test-resilience`).

---

## Step 3 — Save Persistent Report (`docs/qa/TEST_FORGE_REPORT.md`)

Create `docs/qa/` if needed and write **`docs/qa/TEST_FORGE_REPORT.md`** using this exact structured template:

```markdown
# TestForge QA & Security Audit Report

- **Date:** YYYY-MM-DD HH:MM
- **Detected Stack:** <frameworks & project types>
- **Quality Score:** **XX / 100**
- **Security Score:** **XX / 100**
- **Release Verdict:** `BLOCKED (P0/P1 present)` | `CONDITIONAL (P2/P3 only)` | `READY`

## 1. Execution Matrix
| Suite | Scope | Status | Details |
| :--- | :--- | :---: | :--- |
| Build & Static Types | ... | PASS / FAIL | ... |
| Smoke & Sanity | ... | PASS / FAIL | ... |
| Functional & Regression | ... | PASS / FAIL | ... |
| Security (SAST + SCA + Red-Team + DAST) | ... | PASS / FAIL | ... |
| Performance / Resilience / Parity | ... | PASS / SKIPPED | ... |

## 2. Prioritized Findings (Awaiting User Approval)
| ID | Sev | Domain | Location | Issue | Evidence / PoC | Proposed Fix |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| SEC-01 | **P0** | ... | `file:line` | ... | ... | ... |
| FUNC-01 | **P1** | ... | `file:line` | ... | ... | ... |

## 3. Detailed Remediation Plan
For each finding ID, describe the exact safe patch to apply once approved.

## 4. Test Coverage & Remaining Human-Only Checks
List any human-only checks recommended before release (e.g., physical device testing, external Beta users, formal PCI-DSS certification).
```

---

## Step 4 — Chat Summary & Mandatory Approval Gate (Option A)

1. Present a **concise, crystal-clear executive summary in chat** in the user's language (scores, pass/fail table, top `P0`–`P3` findings with IDs, and clickable link to `docs/qa/TEST_FORGE_REPORT.md`).
2. **STOP before modifying application code** to fix security flaws or logic bugs.
3. Ask the user explicitly:
   > *"Le rapport complet est sauvegardé dans `docs/qa/TEST_FORGE_REPORT.md`. Souhaites-tu que j'applique les corrections ? Réponds `corrige tout`, `corrige P0/P1 uniquement`, ou indique les IDs souhaités (ex: `SEC-01, FUNC-02`)."*
4. **After user approval:** Apply ONLY the approved fixes, write regression tests proving each fixed bug/vulnerability cannot return, re-run verification, and update `docs/qa/TEST_FORGE_REPORT.md` with the new passing scores!
