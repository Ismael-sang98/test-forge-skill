#!/usr/bin/env node
/**
 * TestForge Real-Time Secret & P0 Guard — PreToolUse Lifecycle Hook
 *
 * Blocks high-confidence P0 security catastrophes BEFORE they touch disk:
 *   - Live cloud/payment/AI/GitHub/Slack secrets & private keys (PEM)
 *   - Hardcoded remote DB URIs with real credentials
 *   - Lethal wildcard Firebase rules (allow read, write: if true;)
 *
 * Zero false positives on docs/, *.md, .env.example, placeholders, or .test-ignore.
 */

import fs from "node:fs";
import path from "node:path";
import {
  extractTargetFile,
  extractWrittenContent,
  findProjectRoot,
  isMainModule,
  isSelfPluginRepo,
  isSystemOrDocPath,
  readStdinJson,
  respondJson
} from "./lib/utils.mjs";

const PLACEHOLDER_RE =
  /(EXAMPLE|DUMMY|FAKE|PLACEHOLDER|REPLACE_ME|YOUR_[A-Z0-9_]+|CHANGEME|TEST_KEY|xxxx|00000000)/i;

const SECRET_RULES = [
  {
    id: "GUARD-001",
    label: "Hardcoded Private Key (PEM)",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/
  },
  {
    id: "GUARD-002",
    label: "AWS Access Key ID",
    regex: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    id: "GUARD-003",
    label: "Stripe Live Secret / Restricted Key",
    regex: /\b[rs]k_live_[0-9a-zA-Z]{16,}\b/
  },
  {
    id: "GUARD-004",
    label: "GitHub Personal Access Token",
    regex: /\b(?:ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{30,})\b/
  },
  {
    id: "GUARD-005",
    label: "Slack API Token",
    regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}\b/
  },
  {
    id: "GUARD-006",
    label: "Anthropic / OpenAI Live API Key",
    regex: /\b(?:sk-ant-[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{20,})\b/
  },
  {
    id: "GUARD-007",
    label: "Hardcoded Remote Database Password URI",
    regex:
      /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s"'`]+:[^@\s"'`]{6,}@(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|postgres\b|mysql\b|redis\b|mongo\b|db\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i
  }
];

const FIREBASE_WILDCARD_RE = /allow\s+(?:read\s*,\s*write|write\s*,\s*read|write)\s*:\s*if\s+true\s*;/i;

export function inspectContentForP0Blocks(targetFile, content) {
  if (!content || typeof content !== "string") return null;

  const baseName = path.basename(targetFile || "").toLowerCase();
  const isTestFile = /(\.test\.|\.spec\.|__tests__|\/tests?\/)/i.test(targetFile || "");

  for (const rule of SECRET_RULES) {
    const match = content.match(rule.regex);
    if (match) {
      const lineSnippet = getLineForIndex(content, match.index);
      if (PLACEHOLDER_RE.test(lineSnippet)) continue;
      if (isTestFile && /test|mock|stub|fixture/i.test(lineSnippet)) continue;
      return {
        id: rule.id,
        label: rule.label,
        reason: `TEST-FORGE SECRET GUARD [${rule.id}]: Detected ${rule.label} while writing "${baseName}". Hardcoded secrets are strictly forbidden. Move this value into environment variables (.env) and reference it securely via process.env / Secret Manager.`
      };
    }
  }

  if (baseName === "firestore.rules" || baseName === "storage.rules") {
    const match = content.match(FIREBASE_WILDCARD_RE);
    if (match) {
      const lineSnippet = getLineForIndex(content, match.index);
      if (!/emulator|test-only/i.test(lineSnippet)) {
        return {
          id: "GUARD-008",
          label: "Wildcard Public Write Rule in Firebase Rules",
          reason: `TEST-FORGE P0 SECURITY GUARD [GUARD-008]: Detected open wildcard write rule ("${match[0].trim()}") in "${baseName}". Allowing unrestricted public writes exposes your entire database/storage to immediate compromise. Enforce strict authentication and ownership/RBAC checks.`
        };
      }
    }
  }

  return null;
}

function getLineForIndex(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

async function main() {
  const payload = await readStdinJson();
  const args = payload?.toolCall?.args;
  const targetFile = extractTargetFile(args);
  if (!targetFile) return respondJson({ decision: "allow" });

  const projectRoot = findProjectRoot(targetFile, payload?.workspacePaths);

  if (projectRoot && fs.existsSync(path.join(projectRoot, ".test-ignore"))) {
    return respondJson({ decision: "allow" });
  }
  if (isSelfPluginRepo(projectRoot)) {
    return respondJson({ decision: "allow" });
  }
  if (isSystemOrDocPath(targetFile, projectRoot, payload?.artifactDirectoryPath)) {
    return respondJson({ decision: "allow" });
  }

  const content = extractWrittenContent(args);
  const violation = inspectContentForP0Blocks(targetFile, content);
  if (violation) {
    return respondJson({
      decision: "deny",
      reason: violation.reason
    });
  }

  return respondJson({ decision: "allow" });
}

if (isMainModule(import.meta.url)) {
  main().catch(() => respondJson({ decision: "allow" }));
}
