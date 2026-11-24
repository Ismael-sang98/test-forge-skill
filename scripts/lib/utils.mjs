#!/usr/bin/env node
/**
 * TestForge Shared Utilities
 * Zero-dependency cross-platform helpers for hooks and CLI scanners.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  try {
    return metaUrl === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

export const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".dart", ".java", ".kt", ".kts", ".swift",
  ".cs", ".go", ".rs", ".php", ".rb", ".cpp", ".cc",
  ".c", ".h", ".hpp", ".vue", ".svelte", ".astro",
  ".sql", ".prisma", ".graphql", ".proto", ".rules"
]);

export const SECURITY_CONFIG_FILENAMES = new Set([
  "firestore.rules",
  "storage.rules",
  "database.rules.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
  "AndroidManifest.xml",
  "Info.plist",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "firebase.json",
  "application.properties",
  "application.yml",
  "application.yaml"
]);

export const IGNORED_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt",
  ".svelte-kit", ".dart_tool", ".idea", ".vscode", "target", "bin",
  "obj", "vendor", ".venv", "venv", "__pycache__", "coverage",
  ".turbo", ".cache", "Pods", ".gradle", "android/.gradle",
  ".agents", ".agent", ".gemini", ".claude", ".cursor", ".codex"
]);

export const DOC_TOP_DIRS = new Set([
  "docs", "Docs", ".agents", ".agent", ".cursor", ".claude", ".codex", ".github"
]);

export async function readStdinJson() {
  if (process.stdin.isTTY) return {};
  let raw = "";
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function respondJson(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
  process.exit(0);
}

export function isSubPath(childPath, parentPath) {
  if (!childPath || !parentPath) return false;
  const rel = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function extractTargetFile(args) {
  if (!args || typeof args !== "object") return null;
  const candidate =
    args.Path ||
    args.TargetFile ||
    args.path ||
    args.file_path ||
    args.filePath ||
    args.target_file;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

export function extractWrittenContent(args) {
  if (!args || typeof args !== "object") return "";
  const parts = [];
  for (const key of [
    "Content",
    "Replacement",
    "ReplacementContent",
    "CodeContent",
    "content",
    "new_string",
    "new_str",
    "replacement"
  ]) {
    if (typeof args[key] === "string" && args[key].length > 0) {
      parts.push(args[key]);
    }
  }
  if (Array.isArray(args.ReplacementChunks)) {
    for (const chunk of args.ReplacementChunks) {
      if (chunk && typeof chunk.ReplacementContent === "string") {
        parts.push(chunk.ReplacementContent);
      }
    }
  }
  return parts.join("\n");
}

export function extractCommandLine(args) {
  if (!args || typeof args !== "object") return "";
  for (const key of ["CommandLine", "command", "cmd", "commandLine"]) {
    if (typeof args[key] === "string" && args[key].trim().length > 0) {
      return args[key].trim();
    }
  }
  return "";
}

export function findProjectRoot(hintPath, workspacePaths) {
  if (Array.isArray(workspacePaths) && workspacePaths.length > 0) {
    const validWs = workspacePaths
      .filter((ws) => typeof ws === "string" && ws.trim().length > 0)
      .map((ws) => path.resolve(ws));

    if (hintPath) {
      const resolvedHint = path.resolve(hintPath);
      const matching = validWs
        .filter((ws) => isSubPath(resolvedHint, ws))
        .sort((a, b) => b.length - a.length);
      if (matching.length > 0) return matching[0];
    }
    if (validWs.length > 0) return validWs[0];
  }

  if (!hintPath) return null;
  let current = fs.existsSync(hintPath) && fs.statSync(hintPath).isDirectory()
    ? path.resolve(hintPath)
    : path.dirname(path.resolve(hintPath));

  const rootMarkers = [
    ".git",
    ".test-ignore",
    "package.json",
    "pubspec.yaml",
    "pyproject.toml",
    "requirements.txt",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "firebase.json",
    "go.mod",
    "Cargo.toml"
  ];

  while (true) {
    for (const marker of rootMarkers) {
      if (fs.existsSync(path.join(current, marker))) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function isSelfPluginRepo(projectRoot) {
  if (!projectRoot) return false;
  const manifestPath = path.join(projectRoot, "plugin.json");
  if (!fs.existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return manifest?.name === "test-forge" || manifest?.name === "spec-forge";
  } catch {
    return false;
  }
}

export function isTestReportPath(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith("docs/qa/test_forge_report.md");
}

export function isSystemOrDocPath(targetFile, projectRoot, artifactDir) {
  if (!targetFile) return true;
  const resolved = path.resolve(targetFile);
  const home = os.homedir();
  const tmp = os.tmpdir();

  const alwaysSystemPrefixes = [
    artifactDir,
    path.join(home, ".gemini"),
    path.join(home, ".claude"),
    path.join(home, ".codex"),
    path.join(home, ".cursor"),
    path.join(home, ".windsurf"),
    path.join(home, ".codeium"),
    path.join(home, ".agents")
  ].filter(Boolean);

  for (const prefix of alwaysSystemPrefixes) {
    if (isSubPath(resolved, prefix)) return true;
  }

  const inWorkspace = Boolean(projectRoot && isSubPath(resolved, projectRoot));
  if (!inWorkspace) {
    for (const tmpPrefix of [tmp, "/tmp", "/private/tmp"].filter(Boolean)) {
      if (isSubPath(resolved, tmpPrefix)) return true;
    }
  }

  const ext = path.extname(resolved).toLowerCase();
  const base = path.basename(resolved);

  if (ext === ".md" || ext === ".mdx" || ext === ".txt") return true;
  if (base === ".test-ignore" || base === ".spec-ignore" || base === "LICENSE" || base === ".gitignore") {
    return true;
  }
  if (/^\.env\.(example|sample|template)$/i.test(base)) return true;

  if (projectRoot && isSubPath(resolved, projectRoot)) {
    const rel = path.relative(projectRoot, resolved);
    const top = rel.split(path.sep)[0];
    if (DOC_TOP_DIRS.has(top)) return true;
  }
  return false;
}

export function isCodeFile(targetFile, projectRoot, artifactDir) {
  if (!targetFile) return false;
  if (isSystemOrDocPath(targetFile, projectRoot, artifactDir)) return false;
  const base = path.basename(targetFile);
  if (SECURITY_CONFIG_FILENAMES.has(base)) return true;
  const ext = path.extname(targetFile).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

export function isVerificationCommand(cmd) {
  if (!cmd) return false;
  const patterns = [
    /\b(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|check|typecheck|build|verify|audit)\b/i,
    /\b(vitest|jest|playwright|cypress|mocha|ava)\b/i,
    /\bnode\s+--test\b/i,
    /\btsc\b.*--noEmit/i,
    /\b(pytest|unittest|mypy|ruff|flake8|bandit|pip-audit|safety)\b/i,
    /\bpython3?\s+-m\s+(pytest|unittest|py_compile)\b/i,
    /\b(flutter|dart)\s+(test|analyze|build)\b/i,
    /\b(mvn|mvnw|\.?\/mvnw|gradle|gradlew|\.?\/gradlew)\s+.*(test|check|verify|compile|build)/i,
    /\b(go\s+test|cargo\s+test|cargo\s+clippy|dotnet\s+test|phpunit|rspec)\b/i,
    /\b(k6|locust|artillery|autocannon|jmeter)\b/i,
    /\bfirebase\s+emulators:exec\b/i,
    /static-sec-scan\.mjs/i,
    /\b(trivy|semgrep|gitleaks|osv-scanner|snyk)\b/i
  ];
  return patterns.some((re) => re.test(cmd));
}

export function isSecurityScanCommand(cmd) {
  if (!cmd) return false;
  const patterns = [
    /static-sec-scan\.mjs/i,
    /\b(npm|pnpm|yarn)\s+audit\b/i,
    /\b(pip-audit|bandit|safety|semgrep|trivy|gitleaks|osv-scanner|snyk)\b/i,
    /\bfirebase\s+emulators:exec\b/i,
    /dependency-check/i
  ];
  return patterns.some((re) => re.test(cmd));
}

export function getStateDir() {
  const base = process.env.PLUGIN_DATA || path.join(os.tmpdir(), "test-forge-data");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

export function hashString(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex").slice(0, 12);
}

export function getSessionStatePath(conversationId) {
  const safeId = (conversationId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = path.join(getStateDir(), "sessions");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${safeId}.json`);
}

export function loadSessionState(conversationId) {
  const file = getSessionStatePath(conversationId);
  if (!fs.existsSync(file)) {
    return {
      modifiedCodeFiles: [],
      lastCodeEditAt: 0,
      lastVerificationAt: 0,
      lastSecurityScanAt: 0,
      reportWrittenAt: 0,
      lastVerificationCmd: ""
    };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {
      modifiedCodeFiles: [],
      lastCodeEditAt: 0,
      lastVerificationAt: 0,
      lastSecurityScanAt: 0,
      reportWrittenAt: 0,
      lastVerificationCmd: ""
    };
  }
}

export function saveSessionState(conversationId, state) {
  const file = getSessionStatePath(conversationId);
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export function getPluginRoot() {
  return process.env.PLUGIN_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}
