---
name: test-performance
description: "TestForge Performance, Load & Stress Testing skill: designs and executes automated load tests (expected peak traffic), stress tests (finding breaking points and resource exhaustion), and bottleneck profiling (DB queries, N+1, latency p95/p99, memory leaks) using k6, Locust, Autocannon, or lightweight local scripts. Logs findings in docs/qa/TEST_FORGE_REPORT.md and awaits user approval before optimizing."
---

# TestForge — Performance, Load & Stress Testing (`test-performance`)

Use this skill to measure speed, throughput, stability, scalability, and breaking points — especially for Backend APIs (Node.js, Python, Spring Boot), Next.js Server Routes, and database-heavy workflows.

---

## 1. Performance Test Types

1. **Load Testing (*Yük Testi / Test de Charge*):**
   - Apply expected normal and peak traffic concurrency (e.g., ramp `10 → 50 → 200` virtual users).
   - Measure: **Requests/sec (RPS)**, **p50 / p95 / p99 latency**, **error rate (%)**, **CPU & memory footprint**.
2. **Stress Testing (*Stres Testi / Test de Résistance*):**
   - Push beyond rated capacity or starve resources (small DB connection pool, burst spikes, heavy payloads) to locate the exact **breaking point** and verify graceful degradation (clean `429`/`503` instead of silent hangs or OOM crashes).
3. **Static Bottleneck Audit (Zero-Server Required):**
   - Scan for **N+1 database queries** (queries inside loops), missing DB indexes on foreign keys / `WHERE` columns, unpaginated `SELECT *` / `.findAll()` / unbounded Firestore `.get()` calls, synchronous blocking calls on Node's event loop, and missing caching/compression.

---

## 2. Tool Selection (Local-First & Zero-Friction)

Pick the best available tool on the machine (strictly targeting `localhost` / local staging):
- **k6** (`k6 run tests/perf/load.js`) — Preferred for HTTP APIs & Next.js routes.
- **Autocannon** (`npx autocannon -c 50 -d 15 http://localhost:3000/api/health`) — Instant Node.js benchmark.
- **Locust** (`locust -f tests/perf/locustfile.py --headless -u 100 -r 10 -t 30s`) — Preferred for Python backends.
- **Fallback Zero-Dep Script:** If none are installed, generate a clean Node.js or Python `asyncio` concurrent load harness in `tests/perf/` with explicit p50/p95/p99 and RPS reporting.

---

## 3. Target Thresholds (Default SLA Baselines)

| Metric | Healthy Target | Warning (`P2`) | Critical (`P1`/`P0`) |
| :--- | :--- | :--- | :--- |
| API p95 Latency | `< 200ms` | `200ms – 800ms` | `> 800ms` or timeout |
| Error Rate under Peak Load | `0%` | `0.1% – 1%` | `> 1%` or server crash |
| Unbounded List Queries | Paginated (`limit`) | High page size | Full table scan / OOM |
| Graceful Stress Degradation | Clean `429`/`503` | Slow recovery | Process crash / deadlock |

---

## 4. Reporting & Approval Gate
Save all benchmark metrics, bottleneck locations (`PERF-01`, `PERF-02`, ...), and optimization recommendations into **`docs/qa/TEST_FORGE_REPORT.md`**, present a concise summary in chat, and **wait for user approval** before refactoring queries, adding indexes, or tuning pools.
