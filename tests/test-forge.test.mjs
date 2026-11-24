#!/usr/bin/env node
/**
 * TestForge Automated Self-Test Suite (Zero Dependencies — Node.js built-in test runner)
 * Run: node --test tests/test-forge.test.mjs
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { detectProjectProfile } from "../scripts/detect-project.mjs";
import { inspectContentForP0Blocks } from "../scripts/secret-guard.mjs";
import { runStaticSecurityScan } from "../scripts/static-sec-scan.mjs";
import { evaluateStopGate } from "../scripts/strict-gate.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `test-forge-${prefix}-`));
}

function runHook(scriptRelPath, stdinPayload, envOverrides = {}) {
  const scriptPath = path.join(REPO_ROOT, scriptRelPath);
  const res = spawnSync(process.execPath, [scriptPath], {
    input: JSON.stringify(stdinPayload),
    encoding: "utf8",
    env: { ...process.env, ...envOverrides }
  });
  assert.equal(res.status, 0, `Hook ${scriptRelPath} failed: ${res.stderr}`);
  return JSON.parse((res.stdout || "{}").trim());
}

describe("TestForge Manifests & JSON Validity", () => {
  it("validates plugin.json, .claude-plugin/plugin.json, and hooks.json", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "plugin.json"), "utf8"));
    assert.equal(manifest.name, "test-forge");
    assert.equal(manifest.logo, "assets/logo.svg");
    assert.equal(manifest.suggestedPrompts.length, 3);

    const claudeManifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8")
    );
    assert.equal(claudeManifest.name, "test-forge");

    const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "hooks.json"), "utf8"));
    assert.ok(hooks["test-forge-project-detector"].SessionStart);
    assert.ok(hooks["test-forge-secret-guard"].PreToolUse);
    assert.ok(hooks["test-forge-activity-tracker"].PostToolUse);
    assert.ok(hooks["test-forge-strict-gate"].Stop);
  });
});

describe("Project Auto-Detector (detect-project.mjs)", () => {
  it("detects Next.js + Firebase + Vitest + optional SpecForge docs cleanly", () => {
    const dir = makeTempDir("nextjs-fb");
    try {
      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({
          dependencies: { next: "15.0.0", react: "19.0.0", firebase: "11.0.0" },
          devDependencies: { vitest: "2.0.0", "@playwright/test": "1.50.0" }
        })
      );
      fs.writeFileSync(path.join(dir, "firestore.rules"), "rules_version = '2';");
      fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
      fs.writeFileSync(path.join(dir, "docs", "01_PRD.md"), "# PRD");

      const profile = detectProjectProfile(dir);
      assert.ok(profile.projectTypes.includes("web"));
      assert.ok(profile.projectTypes.includes("firebase"));
      assert.ok(profile.frameworks.includes("nextjs"));
      assert.ok(profile.testRunners.includes("vitest"));
      assert.ok(profile.testRunners.includes("playwright"));
      assert.ok(profile.securityChecklist.includes("nextjs-rsc-server-actions"));
      assert.ok(profile.securityChecklist.includes("firebase-rules-auth-functions"));
      assert.deepEqual(profile.specForgeDocs, ["docs/01_PRD.md"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects Flutter + Spring Boot + Python FastAPI + Docker cleanly (without SpecForge)", () => {
    const dir = makeTempDir("polyglot");
    try {
      fs.writeFileSync(path.join(dir, "pubspec.yaml"), "name: app\ndependencies:\n  flutter:\n    sdk: flutter\n");
      fs.writeFileSync(path.join(dir, "pom.xml"), "<artifactId>spring-boot-starter-web</artifactId>");
      fs.writeFileSync(path.join(dir, "requirements.txt"), "fastapi==0.115.0\npytest==8.3.0\n");
      fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:22-alpine\nUSER node\n");

      const profile = detectProjectProfile(dir);
      assert.ok(profile.projectTypes.includes("mobile"));
      assert.ok(profile.projectTypes.includes("backend"));
      assert.ok(profile.projectTypes.includes("docker"));
      assert.ok(profile.frameworks.includes("flutter"));
      assert.ok(profile.frameworks.includes("spring-boot"));
      assert.ok(profile.frameworks.includes("fastapi"));
      assert.equal(profile.specForgeDocs.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Real-Time Secret & P0 Guard (secret-guard.mjs)", () => {
  it("blocks hardcoded AWS keys, Stripe live keys, PEM private keys, and wildcard Firebase writes", () => {
    const fakeAws = "AKIA" + "1234567890ABCDEF";
    assert.ok(inspectContentForP0Blocks("src/config.ts", `const k = "${fakeAws}";`));

    const fakeStripe = "sk_live_" + "99887766554433221100";
    assert.ok(inspectContentForP0Blocks("src/pay.ts", `export const s = "${fakeStripe}";`));

    const fakePem = "-----BEGIN RSA " + "PRIVATE KEY-----\nMIIE...";
    assert.ok(inspectContentForP0Blocks("src/auth.py", fakePem));

    assert.ok(
      inspectContentForP0Blocks("firestore.rules", "match /{document=**} { allow read, write: if true; }")
    );
  });

  it("allows clean code, placeholders, and docs/*.md writes without false positives", () => {
    const dir = makeTempDir("guard-clean");
    try {
      fs.writeFileSync(path.join(dir, "package.json"), "{}");
      assert.equal(
        inspectContentForP0Blocks("src/config.ts", "const k = process.env.STRIPE_SECRET_KEY;"),
        null
      );
      assert.equal(
        inspectContentForP0Blocks("src/config.ts", 'const k = "sk_live_EXAMPLE_PLACEHOLDER_123456";'),
        null
      );

      // End-to-end PreToolUse hook check on docs/01_PRD.md (SpecForge coexistence)
      const docOut = runHook("scripts/secret-guard.mjs", {
        workspacePaths: [dir],
        toolCall: {
          name: "write_file",
          args: {
            Path: path.join(dir, "docs", "01_PRD.md"),
            Content: "Never write `allow read, write: if true;` in firestore.rules."
          }
        }
      });
      assert.equal(docOut.decision, "allow");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("Strict Gate & Zero-Conflict / Anti-Loop Guarantee (track-activity.mjs + strict-gate.mjs)", () => {
  it("stays 100% silent on documentation-only turns (e.g. spec-init)", () => {
    const dir = makeTempDir("docs-only");
    const stateDir = makeTempDir("state-docs");
    try {
      fs.writeFileSync(path.join(dir, "package.json"), "{}");
      const convId = "conv-docs-only";

      runHook(
        "scripts/track-activity.mjs",
        {
          conversationId: convId,
          workspacePaths: [dir],
          toolCall: { name: "write_file", args: { Path: path.join(dir, "docs", "01_PRD.md"), Content: "# PRD" } }
        },
        { PLUGIN_DATA: stateDir }
      );

      const stopOut = runHook(
        "scripts/strict-gate.mjs",
        { conversationId: convId, workspacePaths: [dir], terminationReason: "NO_TOOL_CALL", continuationActive: false },
        { PLUGIN_DATA: stateDir }
      );
      assert.equal(stopOut.decision, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("forces verification on unverified code edits, then allows clean stop once verified OR on continuationActive", () => {
    const dir = makeTempDir("code-gate");
    const stateDir = makeTempDir("state-code");
    try {
      fs.writeFileSync(path.join(dir, "package.json"), "{}");
      const convId = "conv-code-1";

      // 1. Edit source file -> Stop hook MUST force continuation
      runHook(
        "scripts/track-activity.mjs",
        {
          conversationId: convId,
          workspacePaths: [dir],
          toolCall: { name: "write_file", args: { Path: path.join(dir, "src", "auth.ts"), Content: "export const x = 1;" } }
        },
        { PLUGIN_DATA: stateDir }
      );

      const blockedStop = runHook(
        "scripts/strict-gate.mjs",
        { conversationId: convId, workspacePaths: [dir], terminationReason: "NO_TOOL_CALL", continuationActive: false },
        { PLUGIN_DATA: stateDir }
      );
      assert.equal(blockedStop.decision, "continue");
      assert.match(blockedStop.reason, /TEST-FORGE STRICT GATE/);

      // 2. Anti-loop check: if continuationActive === true, Stop hook MUST allow stop so report awaits approval
      const antiLoop = evaluateStopGate(
        { workspacePaths: [dir], terminationReason: "NO_TOOL_CALL", continuationActive: true },
        { modifiedCodeFiles: ["src/auth.ts"], lastCodeEditAt: 100, lastVerificationAt: 0, lastSecurityScanAt: 0, reportWrittenAt: 0 }
      );
      assert.equal(antiLoop.decision, "allow");

      // 3. Complete verification + security scan + docs/qa/TEST_FORGE_REPORT.md -> Stop hook allows cleanly
      runHook(
        "scripts/track-activity.mjs",
        {
          conversationId: convId,
          workspacePaths: [dir],
          toolCall: { name: "run_command", args: { CommandLine: "node scripts/static-sec-scan.mjs ." } }
        },
        { PLUGIN_DATA: stateDir }
      );
      runHook(
        "scripts/track-activity.mjs",
        {
          conversationId: convId,
          workspacePaths: [dir],
          toolCall: { name: "write_file", args: { Path: path.join(dir, "docs", "qa", "TEST_FORGE_REPORT.md"), Content: "# Report" } }
        },
        { PLUGIN_DATA: stateDir }
      );

      const cleanStop = runHook(
        "scripts/strict-gate.mjs",
        { conversationId: convId, workspacePaths: [dir], terminationReason: "NO_TOOL_CALL", continuationActive: false },
        { PLUGIN_DATA: stateDir }
      );
      assert.equal(cleanStop.decision, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});

describe("Multi-Stack Static Security Scanner (static-sec-scan.mjs)", () => {
  it("detects Next.js, Backend SQLi, Mobile storage, Firebase rules, and Docker flaws accurately", () => {
    const dir = makeTempDir("vuln-app");
    try {
      const nextFixture = "const key = process.env.NEXT_" + "PUBLIC_STRIPE_SECRET;\n";
      const sqliFixture = 'db.' + 'query(`SELECT * FROM users WHERE id = ${req.params.id}`);\n';
      fs.writeFileSync(path.join(dir, "next.ts"), nextFixture);
      fs.writeFileSync(path.join(dir, "db.js"), sqliFixture);
      fs.writeFileSync(path.join(dir, "auth.dart"), 'await SharedPreferences.getInstance().then((p) => p.setString("jwt_token", token));\n');
      fs.writeFileSync(path.join(dir, "firestore.rules"), "allow read, write: if true;\n");
      fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:latest\nCMD [\"node\", \"index.js\"]\n");

      const report = runStaticSecurityScan(dir);
      const ids = new Set(report.findings.map((f) => f.id));

      assert.ok(ids.has("SEC-004"), "Should detect open Firebase write rule");
      assert.ok(ids.has("SEC-005"), "Should detect NEXT_PUBLIC_ secret leak");
      assert.ok(ids.has("SEC-006"), "Should detect SQL injection template literal");
      assert.ok(ids.has("SEC-015"), "Should detect unencrypted mobile token storage");
      assert.ok(ids.has("SEC-019"), "Should detect Docker :latest tag");
      assert.ok(ids.has("SEC-DOCKER-USER"), "Should detect missing non-root USER in Dockerfile");
      assert.ok(report.securityScore < 50, `Expected low security score, got ${report.securityScore}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("scores 100/100 on a clean hardened project and executes via CLI --json", () => {
    const dir = makeTempDir("clean-app");
    try {
      fs.writeFileSync(path.join(dir, "server.ts"), "export function sum(a: number, b: number) { return a + b; }\n");
      fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:22.11-alpine\nUSER node\nCMD [\"node\", \"dist/index.js\"]\n");

      const raw = execFileSync(
        process.execPath,
        [path.join(REPO_ROOT, "scripts", "static-sec-scan.mjs"), dir, "--json"],
        { encoding: "utf8" }
      );
      const parsed = JSON.parse(raw);
      assert.equal(parsed.securityScore, 100);
      assert.equal(parsed.findings.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
