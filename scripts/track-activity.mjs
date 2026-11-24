#!/usr/bin/env node
/**
 * TestForge Silent Activity Tracker — PostToolUse Lifecycle Hook
 *
 * Tracks modified source files (strictly ignoring docs/ and markdown turns)
 * and records when verification commands, security scans, and
 * docs/qa/TEST_FORGE_REPORT.md are executed.
 *
 * Always outputs `{}` per PostToolUse contract.
 */

import fs from "node:fs";
import path from "node:path";
import {
  extractCommandLine,
  extractTargetFile,
  findProjectRoot,
  isCodeFile,
  isMainModule,
  isSecurityScanCommand,
  isSelfPluginRepo,
  isTestReportPath,
  isVerificationCommand,
  loadSessionState,
  readStdinJson,
  respondJson,
  saveSessionState
} from "./lib/utils.mjs";

async function main() {
  const payload = await readStdinJson();
  const toolName = payload?.toolCall?.name || "";
  const args = payload?.toolCall?.args || {};
  const conversationId = payload?.conversationId || "default";
  const now = Date.now();

  const state = loadSessionState(conversationId);

  if (
    toolName === "write_file" ||
    toolName === "write_to_file" ||
    toolName === "edit_file" ||
    toolName === "replace_file_content" ||
    toolName === "multi_replace_file_content"
  ) {
    const targetFile = extractTargetFile(args);
    if (!targetFile) return respondJson({});

    const projectRoot = findProjectRoot(targetFile, payload?.workspacePaths);
    if (projectRoot && fs.existsSync(path.join(projectRoot, ".test-ignore"))) {
      return respondJson({});
    }
    if (isSelfPluginRepo(projectRoot)) {
      return respondJson({});
    }

    if (isTestReportPath(targetFile)) {
      state.reportWrittenAt = now;
      saveSessionState(conversationId, state);
      return respondJson({});
    }

    if (isCodeFile(targetFile, projectRoot, payload?.artifactDirectoryPath)) {
      const displayPath = projectRoot
        ? path.relative(projectRoot, path.resolve(targetFile))
        : targetFile;
      if (!state.modifiedCodeFiles.includes(displayPath)) {
        state.modifiedCodeFiles.push(displayPath);
      }
      state.lastCodeEditAt = now;
      saveSessionState(conversationId, state);
    }
    return respondJson({});
  }

  if (toolName === "run_command") {
    const cmd = extractCommandLine(args);
    if (isVerificationCommand(cmd)) {
      state.lastVerificationAt = now;
      state.lastVerificationCmd = cmd.slice(0, 200);
      if (isSecurityScanCommand(cmd)) {
        state.lastSecurityScanAt = now;
      }
      saveSessionState(conversationId, state);
    }
    return respondJson({});
  }

  return respondJson({});
}

if (isMainModule(import.meta.url)) {
  main().catch(() => respondJson({}));
}
