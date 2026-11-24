#!/usr/bin/env node
/**
 * TestForge Strict Quality Gate — Stop Lifecycle Hook
 *
 * Enforces Option A (Strict Verification + Report-First Approval):
 *   1. Completely silent on Q&A, translations, and documentation-only turns (e.g. spec-init).
 *   2. Completely bypassed when `.test-ignore` exists or inside self plugin repos.
 *   3. If source code was modified in this turn without running verification + security scan +
 *      writing docs/qa/TEST_FORGE_REPORT.md, blocks premature stop (`decision: "continue"`).
 *   4. Anti-loop guarantee: if `continuationActive === true`, allows stopping cleanly so the
 *      agent can present docs/qa/TEST_FORGE_REPORT.md and await user approval before fixes.
 */

import fs from "node:fs";
import path from "node:path";
import {
  findProjectRoot,
  getPluginRoot,
  isMainModule,
  isSelfPluginRepo,
  loadSessionState,
  readStdinJson,
  respondJson,
  saveSessionState
} from "./lib/utils.mjs";

export function evaluateStopGate(payload, state) {
  // Never interfere with errors, cancellations, or budget caps
  if (payload?.terminationReason && payload.terminationReason !== "NO_TOOL_CALL") {
    return { decision: "allow" };
  }

  const root =
    (Array.isArray(payload?.workspacePaths) && payload.workspacePaths[0]) ||
    payload?.cwd ||
    null;

  if (root) {
    const projectRoot = findProjectRoot(root, payload?.workspacePaths) || root;
    if (fs.existsSync(path.join(projectRoot, ".test-ignore"))) {
      return { decision: "allow" };
    }
    if (isSelfPluginRepo(projectRoot)) {
      return { decision: "allow" };
    }
  }

  // No source code modified -> stay completely silent (zero friction with spec-forge/docs!)
  if (!state || !Array.isArray(state.modifiedCodeFiles) || state.modifiedCodeFiles.length === 0) {
    return { decision: "allow" };
  }

  const verifiedAfterEdit = state.lastVerificationAt >= state.lastCodeEditAt && state.lastVerificationAt > 0;
  const secScannedAfterEdit = state.lastSecurityScanAt >= state.lastCodeEditAt && state.lastSecurityScanAt > 0;
  const reportFresh = state.reportWrittenAt >= state.lastCodeEditAt && state.reportWrittenAt > 0;

  // All strict checks + report already completed after last code edit
  if (verifiedAfterEdit && secScannedAfterEdit && reportFresh) {
    return { decision: "allow", resetFiles: true };
  }

  // Anti-loop safeguard: Stop hook already forced a verification pass in this turn.
  // Allow stopping now so the agent presents the report and awaits user approval.
  if (payload?.continuationActive === true) {
    return { decision: "allow", resetFiles: true };
  }

  const missing = [];
  if (!verifiedAfterEdit) missing.push("run applicable build/syntax & test verification");
  if (!secScannedAfterEdit) {
    const scanPath = path.join(getPluginRoot(), "scripts", "static-sec-scan.mjs");
    missing.push(`run security scan (node "${scanPath}")`);
  }
  if (!reportFresh) missing.push("write/update docs/qa/TEST_FORGE_REPORT.md");

  const fileList = state.modifiedCodeFiles.slice(0, 8).join(", ");
  const extra = state.modifiedCodeFiles.length > 8 ? ` (+${state.modifiedCodeFiles.length - 8} more)` : "";

  return {
    decision: "continue",
    reason:
      `TEST-FORGE STRICT GATE: You modified source code (${fileList}${extra}) and still need to: ${missing.join("; ")}. ` +
      `Execute these checks now. Per Option A: auto-fix ONLY trivial syntax/compile errors in new code you just wrote; ` +
      `do NOT auto-fix security flaws or pre-existing logic bugs — save the full report to docs/qa/TEST_FORGE_REPORT.md, ` +
      `present a concise summary in chat, and ask for the user's explicit approval before applying fixes.`
  };
}

async function main() {
  const payload = await readStdinJson();
  const conversationId = payload?.conversationId || "default";
  const state = loadSessionState(conversationId);
  const result = evaluateStopGate(payload, state);

  if (result.resetFiles) {
    state.modifiedCodeFiles = [];
    saveSessionState(conversationId, state);
  }

  if (result.decision === "continue") {
    return respondJson({
      decision: "continue",
      reason: result.reason
    });
  }

  return respondJson({});
}

if (isMainModule(import.meta.url)) {
  main().catch(() => respondJson({}));
}
