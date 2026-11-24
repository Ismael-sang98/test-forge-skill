---
name: test-resilience
description: "TestForge Resilience Testing skill: automates Installation / Clean-Room Build Testing (OA&M, Docker, env setup), Configuration Matrix Testing (dev/staging/prod configs, missing env vars, multi-runtime), and Recovery / Restore Testing (DB disconnect, crash recovery, transaction rollback, timeout failover). Reports findings in docs/qa/TEST_FORGE_REPORT.md and awaits user approval."
---

# TestForge — Installation, Configuration & Recovery Testing (`test-resilience`)

Use this skill before production release, during DevOps/Docker hardening, or whenever verifying that an application installs cleanly, behaves safely across configurations, and recovers gracefully from crashes and infrastructure failures.

---

## 1. Installation & Clean-Room Testing (*Kurulum Testi / OA&M*)

Verify the software installs, upgrades, and runs cleanly from scratch:
- **Clean Install Verification:** Dependencies resolve deterministically from lockfiles (`npm ci`, `flutter pub get`, `pip install -r`, `mvn clean verify`).
- **Environment Contract Check:** Compare `.env.example` against every `process.env.*` / `os.getenv(...)` / `@Value(...)` reference in source code — flag any undocumented or unvalidated environment variable.
- **Container / Build Check:** If `Dockerfile` or `docker-compose.yml` exists, verify build syntax, healthchecks, non-root user, and `.dockerignore`.
- **Startup Fail-Fast Check:** Verify the app fails cleanly with a clear error message (not a cryptic null-pointer crash 10 minutes later) if a required env var is missing.

---

## 2. Configuration Matrix Testing (*Yapılandırma Testi*)

Verify system behavior across required runtime configurations:
- Development vs. Staging vs. Production feature flags and logging levels.
- Different locales, timezones (UTC vs. local offsets), and currency formats.
- Cross-platform path handling (macOS/Linux `/` vs. Windows `\`).
- Mobile build flavors (`debug` vs. `release` signing/network configs) and Web responsive viewports.

---

## 3. Recovery & Restore Testing (*Kurtarma / Geri Yükleme Testi*)

Verify the application survives hardware/software failures without data corruption:
- **Database / External Service Outage Simulation:** Test via mocked/injected disconnects or timeouts — verify transactions roll back atomically (ACID), partial corrupt state is never persisted, and clients receive clean `503` errors with retry guidance.
- **Idempotency & Replay:** Verify retried payment/webhook/order requests after a mid-flight failure do not create duplicate charges or double entries.
- **Backup & Restore Integrity:** Verify database migration scripts (`up` / `down`), seed scripts, and backup/restore procedures (when present) leave the system at a known consistent state.

---

## 4. Reporting & Approval Gate
Log all resilience gaps (`RES-01`, `RES-02`, ...) with reproduction commands in **`docs/qa/TEST_FORGE_REPORT.md`**, present the summary in chat, and **wait for user approval** before modifying infrastructure, Dockerfiles, or error-handling code.
