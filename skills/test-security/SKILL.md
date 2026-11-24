---
name: test-security
description: "TestForge Security Fortress & Local Pentest skill: performs 4-layer security testing tailored to Next.js/React, Flutter/React Native, Node/Python/Spring Boot, Firebase, and Docker (SAST, Secret Detection, CVE Dependency Audit, OWASP/Auth/RBAC/Firebase Rules review, and local DAST mini-pentest PoCs). Saves docs/qa/TEST_FORGE_REPORT.md and strictly awaits user approval before remediation."
---

# TestForge — Security Fortress & Local Pentest (`test-security`)

Use this skill whenever the user asks for a security audit, penetration test, OWASP review, secret scan, CVE check, Firebase Rules audit, or when touching auth, payments, permissions, or public endpoints.

---

## Rule #1: Report-First, Zero Silent Edits
Never modify application source code, security rules, or dependencies during a security audit until the user reviews `docs/qa/TEST_FORGE_REPORT.md` and explicitly approves which findings to fix.

---

## 4-Layer Security Testing Protocol

### Layer 1 — Static Security Analysis (SAST) & Secret Hygiene
1. Run the bundled multi-stack scanner (auto-resolving across Antigravity / Codex / Claude Code):
   ```bash
   node ~/.gemini/config/plugins/test-forge/scripts/static-sec-scan.mjs . --json 2>/dev/null \
     || node ~/.agents/test-forge/scripts/static-sec-scan.mjs . --json 2>/dev/null \
     || node ~/.claude/test-forge/scripts/static-sec-scan.mjs . --json
   ```
2. Verify `.gitignore` excludes `.env`, `.env.local`, `*.pem`, `*.key`, `google-services.json` (if private), and Firebase service-account JSON files.
3. Check for secret leaks across code, config files, Dockerfiles, and client-exposed environment variables.

### Layer 2 — Dependency Vulnerability Audit (SCA / CVE)
Run the ecosystem-appropriate audit tool:
- **Node/Next/React/RN:** `npm audit` / `pnpm audit` / `yarn audit`
- **Python:** `pip-audit` (or inspect pinned packages in `requirements.txt` / `pyproject.toml`)
- **Spring Boot / Java:** `mvn dependency:tree` / check for vulnerable Spring/Jackson/Log4j versions
- **Flutter / Dart:** `dart pub outdated`

### Layer 3 — Stack-Specific Deep Red-Team Checklist
*(Delegate to the `test-red-team` subagent when available for unbiased adversarial analysis!)*

#### Web — Next.js & React
- [ ] **Server Actions & API Routes:** Every `"use server"` function and `app/api/**` route verifies authentication AND authorization (never trusts client-passed `userId` or `role`).
- [ ] **Env Separation:** Zero secrets prefixed with `NEXT_PUBLIC_` or `VITE_` or `REACT_APP_`.
- [ ] **XSS & Injection:** Audit every `dangerouslySetInnerHTML`, `innerHTML`, `eval`, dynamic `href="javascript:..."`, and Markdown renderers.
- [ ] **Security Headers & CSRF:** Check `next.config.*` / middleware for `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, SameSite cookies.
- [ ] **SSRF:** Server-side `fetch(userUrl)` validates host allowlists and blocks internal IPs (`169.254.169.254`, `127.0.0.1`, `10.0.0.0/8`).

#### Mobile — Flutter & React Native
- [ ] **Secure Storage:** Auth tokens, refresh tokens, PINs, and PII use `flutter_secure_storage` or `expo-secure-store` / Keychain — NEVER `SharedPreferences` or `AsyncStorage`.
- [ ] **Network & Transport:** No `android:usesCleartextTraffic="true"` or `NSAllowsArbitraryLoads` in release configs; no `badCertificateCallback => true`.
- [ ] **Deep Links & WebViews:** Incoming deep-link parameters are validated/sanitized; WebViews disable unnecessary JS bridges and file access.
- [ ] **Client Bundle Secrets:** Zero backend admin keys, Stripe secret keys, or private signing keys inside Dart/JS code.

#### Backend — Node.js / Python / Spring Boot
- [ ] **OWASP A01 — Broken Access Control / IDOR:** Every `GET/PUT/PATCH/DELETE /:id` scopes queries by authenticated tenant/owner (`WHERE id = ? AND user_id = ?`) and enforces RBAC.
- [ ] **OWASP A02 — Crypto:** Passwords hashed with Argon2id/bcrypt/scrypt (never MD5/SHA1/SHA256); tokens generated with CSPRNG (`crypto.randomBytes`, `secrets.token_urlsafe`, `SecureRandom`).
- [ ] **OWASP A03 — Injection:** 100% parameterized SQL/NoSQL queries; no `shell=True` / `exec()` with user input; file upload path traversal sanitization + MIME/size validation.
- [ ] **OWASP A05 — Misconfiguration:** Strict CORS allowlist (never `*` + credentials), Helmet/security headers, `DEBUG=False`, Spring Actuator locked down (`/actuator/health` only), generic error responses (no stack traces leaked to client).
- [ ] **OWASP A07 — Auth & Rate Limiting:** Strong JWT signature verification + expiration + algorithm pinning; rate limiting on login, signup, password reset, and OTP routes.
- [ ] **Mass Assignment:** Strict DTO / schema validation (Zod, Pydantic, Spring DTOs + `@Valid`) — never bind raw request JSON directly onto DB entities.

#### Firebase (Firestore, Auth, Storage, Cloud Functions)
- [ ] **Default Deny:** Root rule denies all reads/writes unless explicitly matched.
- [ ] **Create vs. Update Parity:** Both `create` and `update` enforce schema/type validation, field allowlists (`hasOnly`), and prevent privilege escalation (users cannot set `role: "admin"` or mutate immutable fields like `ownerId`/`createdAt`).
- [ ] **DoS Bounds:** Strings and lists enforce `.size() <= MAX` limits.
- [ ] **Cloud Functions:** `onCall`/`onRequest` functions validate `request.auth` / ID tokens, App Check where applicable, and input schemas.

#### Docker & Infrastructure
- [ ] Non-root `USER`, pinned image versions (no `:latest`), multi-stage builds without build secrets leaked into final layers, `.dockerignore` excludes `.env` and `.git`.

### Layer 4 — Local Dynamic Pentest (DAST on `localhost` / Emulator ONLY)
If the backend/web server or Firebase Emulator can run locally:
1. **Unauthenticated Access Test:** Call protected endpoints without `Authorization` header → MUST return `401`.
2. **IDOR / Cross-Tenant Test:** Authenticate as User A and request/modify User B's resource ID → MUST return `403` or `404`.
3. **Privilege Escalation Test:** Send `{"role": "admin"}` or `{"isAdmin": true}` in a profile update payload → MUST be rejected or stripped.
4. **Injection & Fuzzing Probe:** Send SQLi (`' OR '1'='1`), XSS (`<script>alert(1)</script>`), path traversal (`../../etc/passwd`), and oversized payloads to input endpoints → MUST return clean `400`/`422` without 500 stack traces.
5. **Firebase Emulator Rules Test:** If `firestore.rules` exists and emulator is available, verify deny rules on anonymous and cross-user writes.

---

## Reporting & Approval
1. Calculate the **Security Score (`/100`)** (`P0: -25`, `P1: -12`, `P2: -5`, `P3: -2`, floor `0`).
2. Write or update **`docs/qa/TEST_FORGE_REPORT.md`** with every finding (`SEC-01`, `SEC-02`, ...), exact `file:line`, PoC evidence, and proposed fix.
3. Present a concise summary in chat and **wait for explicit user approval** before patching any code.
4. *(Note: if the user approves fixing `firestore.rules` and a specialized `firestore-rules-author` subagent is available, delegate rules authoring to it cleanly.)*
