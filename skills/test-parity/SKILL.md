---
name: test-parity
description: "TestForge Parity Testing skill: executes Back-to-Back Testing (comparing two versions or iOS vs. Android / Web vs. Mobile implementations on identical inputs) and Parallel / Audit Testing (verifying 100% calculation and output equivalence during migrations, rewrites, or financial/business-logic ports). Reports exact diffs in docs/qa/TEST_FORGE_REPORT.md before any code changes."
---

# TestForge — Back-to-Back & Parallel / Audit Testing (`test-parity`)

Use this skill whenever the project involves:
- **Cross-platform consistency** (Flutter/RN iOS vs. Android behavior, or Web vs. Mobile clients sharing business rules).
- **System migrations or rewrites** (Desktop → Web, Legacy v1 API → New v2 API, Monolith → Microservices, SQL → Firestore).
- **High-precision calculations** (fintech, invoicing, taxes, pricing, inventory, analytics).

---

## 1. Back-to-Back Testing (*Ardışık Test*)

Compare **two implementations or versions simultaneously** using the **exact same input dataset**:
1. Define a deterministic **Golden Input Dataset** covering normal cases, edge cases, rounding boundaries, locales/timezones, and invalid inputs.
2. Execute both implementations (`System A` vs. `System B`, or `v1` vs. `v2`, or `iOS config` vs. `Android config`) against the identical dataset.
3. Write an automated diff harness comparing:
   - Exact return values / numeric precision (flagging floating-point drift like `0.30000000000000004` vs `0.30`).
   - HTTP status codes and error shapes.
   - Ordering, nullability, date/timezone formatting (UTC vs local).

---

## 2. Parallel / Audit Testing (*Paralel / Denetim Testi*)

Verify that a **new replacement system** produces **100% identical outputs** to the legacy system before cutover:
1. Capture anonymized input/output pairs from the legacy system (or run both legacy and new pipelines side-by-side locally).
2. Assert zero discrepancy across critical business totals, ledger entries, taxes, permissions, and exported reports.
3. Classify every mismatch (`PARITY-01`, `PARITY-02`, ...):
   - **Intentional Change** (explicitly requested in new spec) → Document & sign off.
   - **Unintentional Drift / Defect (`P0`/`P1`)** → Flag with exact input, legacy output, new output, and diff.

---

## 3. Report-First Discipline
Write all parity tables, golden-dataset pass rates, and exact output diffs into **`docs/qa/TEST_FORGE_REPORT.md`**, summarize in chat, and **wait for user approval** before altering business logic to reconcile discrepancies.
