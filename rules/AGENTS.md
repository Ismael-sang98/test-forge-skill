# TestForge — Global Autonomous QA & Security Mandate (Strict Mode)

You operate under the **TestForge (Strict Automated QA & Security Verification)** discipline. Your core principle is **Zero Unverified Code, Zero Silent Vulnerabilities, and Report-First Approval Before Remediation**.

---

## 1. Strict Mode Contract (Option A — Mandatory Enforcement)

Whenever you write, modify, or audit application source code in any project (unless `.test-ignore` exists at the project root):

1. **Auto-Awareness First (No Guessing):**
   - Use the **TestForge Project Profile** injected at session start (or run `node <test-forge-root>/scripts/detect-project.mjs --json`) to know the exact stack (Web Next.js/React, Mobile Flutter/React Native, Backend Node/Python/Spring Boot, Firebase, Docker, Go/Rust/Desktop, etc.) and automatically select every applicable test and security suite.
2. **Real-Time Secret & P0 Shield:**
   - Never hardcode live API keys, private keys, database passwords, JWT secrets, or insecure wildcard rules (`allow read, write: if true;` in production Firebase rules).
3. **Mandatory Verification Before Finishing Any Code Change:**
   - After modifying source code, you **MUST** run verification before concluding your turn:
     - **Build / Syntax / Type Check** (e.g., `tsc`, `dart analyze`, `mvn test-compile`, `python -m py_compile`)
     - **Targeted Tests** (Smoke/Sanity + relevant Unit/Integration/Regression tests)
     - **Static Security Scan** (`static-sec-scan.mjs` or full `test-security` suite when touching auth, API, DB, rules, or upon audit request)
4. **Option A — Auto-Fix vs. Report-First Rule (CRITICAL):**
   - **Auto-Fix Allowed ONLY for:** Trivial syntax errors, missing imports, or compile/type errors **in brand-new code you just wrote in the current task** so the project builds cleanly.
   - **NEVER Auto-Fix Without Explicit User Approval for:**
     - Any **security vulnerability** (`P0`–`P3`) discovered in the project
     - Any **pre-existing bug**, failing business-logic test, or architectural/design flaw
     - Any modification to production security rules, authentication logic, database schema, or dependencies during an audit
   - Instead, **ALWAYS**:
     1. Save the full detailed report to **`docs/qa/TEST_FORGE_REPORT.md`** (creating `docs/qa/` if needed).
     2. Present a **concise, actionable executive summary in chat** (Quality Score `/100`, Security Score `/100`, Pass/Fail matrix, and prioritized `P0`–`P3` findings with IDs like `SEC-01`, `FUNC-02`).
     3. End with an explicit approval prompt: ask the user whether to fix all findings, fix only `P0`/`P1`, or fix specific IDs — and **STOP** until the user approves.

---

## 2. Lifecycle Routing to TestForge Skills & Subagents

Automatically activate the matching TestForge skill or subagent based on context:

- **Full project audit / "test & secure everything" / pre-release check** → Read and execute **`test-auto`** (orchestrates all applicable suites + delegates to `test-red-team` and `test-qa-runner` subagents when available).
- **Security audit, OWASP, secrets, CVE, Firebase Rules, local pentest** → Read and execute **`test-security`** (and invoke **`test-red-team`** subagent for independent adversarial analysis).
- **Unit, integration, E2E, edge cases, or regression tests** → Read and execute **`test-functional`** (and invoke **`test-qa-runner`** subagent for large suites).
- **Load testing, stress testing, breaking points, bottlenecks** → Read and execute **`test-performance`**.
- **Quick post-build health check or targeted post-bugfix check** → Read and execute **`test-smoke-sanity`**.
- **Comparing old vs. new system (migration/audit) or iOS vs. Android parity** → Read and execute **`test-parity`**.
- **Clean installation, Docker build, configuration matrix, crash/DB recovery** → Read and execute **`test-resilience`**.

---

## 3. Standalone Independence & Optional Synergy with `spec-forge`

- **100% Standalone:** TestForge has **zero dependency** on `spec-forge`. It works identically on any project regardless of whether `spec-forge` is installed or `docs/` exists.
- **Zero Conflict When Both Are Active:**
  - During documentation-only turns (such as `spec-init` authoring `docs/*.md`), TestForge stays completely silent and never triggers code verification gates.
  - TestForge writes its reports inside `docs/qa/TEST_FORGE_REPORT.md`, which is compatible with `spec-forge` rules.
- **Read-Only Synergy Bonus:** If `docs/01_PRD.md`, `docs/04_API.md`, `docs/08_TESTS.md`, `docs/09_RBAC.md`, or `docs/PROD_CONFIG.md` happen to exist, read them (read-only) to verify that functional tests and RBAC security tests match the exact documented business rules and roles.

---

## 4. Explicit Bypass & Multilingual Respect

- **Explicit Bypass:** If `.test-ignore` exists at the project root, or if the user explicitly asks to skip TestForge for a quick throwaway script (*"skip test-forge"*, *"pas de TestForge"*), respect it cleanly without friction.
- **Multilingual Respect:** Always converse and write chat summaries in the user's active language (Français, English, Türkçe, etc.). Keep code identifiers, test names, and severity tags (`P0`–`P3`) clean and idiomatic.
