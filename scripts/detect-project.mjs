#!/usr/bin/env node
/**
 * TestForge Project Auto-Detector
 *
 * Dual mode:
 *   1. SessionStart Hook (default, stdin JSON): detects stack & injects Project QA/Security Profile
 *   2. Standalone CLI: `node scripts/detect-project.mjs --cli [targetDir] [--json]`
 */

import fs from "node:fs";
import path from "node:path";
import {
  findProjectRoot,
  getPluginRoot,
  getStateDir,
  hashString,
  IGNORED_DIRS,
  isMainModule,
  readStdinJson,
  respondJson
} from "./lib/utils.mjs";

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function collectMarkerFiles(rootDir, maxDepth = 2) {
  const found = new Map(); // filename -> array of relative paths

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (entry.name === "ios" || entry.name === "android") {
          const list = found.get(`dir:${entry.name}`) || [];
          list.push(path.relative(rootDir, path.join(dir, entry.name)));
          found.set(`dir:${entry.name}`, list);
        }
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const list = found.get(entry.name) || [];
        list.push(path.relative(rootDir, path.join(dir, entry.name)));
        found.set(entry.name, list);
      }
    }
  }

  walk(rootDir, 0);
  return found;
}

export function detectProjectProfile(projectRoot) {
  const profile = {
    projectRoot,
    ignored: false,
    projectTypes: [],
    frameworks: [],
    testRunners: [],
    securityChecklist: [],
    recommendedSkills: [],
    specForgeDocs: [],
    scannerCommand: `node "${path.join(getPluginRoot(), "scripts", "static-sec-scan.mjs")}" "${projectRoot}"`
  };

  if (!projectRoot || !fs.existsSync(projectRoot)) {
    return profile;
  }

  if (fs.existsSync(path.join(projectRoot, ".test-ignore"))) {
    profile.ignored = true;
    return profile;
  }

  const types = new Set();
  const frameworks = new Set();
  const runners = new Set();
  const security = new Set(["secrets", "dependency-cve"]);
  const skills = new Set(["test-functional", "test-security", "test-smoke-sanity"]);

  const markers = collectMarkerFiles(projectRoot, 2);

  // --- Node / JS / TS / Next.js / React / React Native / Electron / Backend ---
  const pkgPaths = markers.get("package.json") || [];
  for (const relPkg of pkgPaths) {
    const pkg = safeReadJson(path.join(projectRoot, relPkg));
    if (!pkg) continue;
    const allDeps = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {})
    };
    const has = (name) => Object.prototype.hasOwnProperty.call(allDeps, name);

    if (has("next")) {
      types.add("web");
      frameworks.add("nextjs");
      security.add("nextjs-rsc-server-actions");
      security.add("web-owasp-xss-csrf-headers");
    }
    if (has("react") && !has("react-native")) {
      types.add("web");
      frameworks.add("react");
      security.add("web-owasp-xss-csrf-headers");
    }
    if (has("vue") || has("nuxt") || has("svelte") || has("@angular/core") || has("astro")) {
      types.add("web");
      if (has("vue")) frameworks.add("vue");
      if (has("nuxt")) frameworks.add("nuxt");
      if (has("svelte")) frameworks.add("svelte");
      if (has("@angular/core")) frameworks.add("angular");
      if (has("astro")) frameworks.add("astro");
      security.add("web-owasp-xss-csrf-headers");
    }
    if (has("react-native") || has("expo")) {
      types.add("mobile");
      frameworks.add(has("expo") ? "expo-react-native" : "react-native");
      security.add("mobile-storage-deeplinks-cleartext");
      skills.add("test-parity");
      skills.add("test-resilience");
    }
    if (has("electron") || has("@tauri-apps/api")) {
      types.add("desktop");
      frameworks.add(has("electron") ? "electron" : "tauri");
      security.add("desktop-ipc-context-isolation");
      skills.add("test-resilience");
    }
    if (has("express") || has("@nestjs/core") || has("fastify") || has("hono") || has("koa")) {
      types.add("backend");
      frameworks.add("nodejs-backend");
      if (has("express")) frameworks.add("express");
      if (has("@nestjs/core")) frameworks.add("nestjs");
      if (has("fastify")) frameworks.add("fastify");
      if (has("hono")) frameworks.add("hono");
      security.add("backend-owasp-sqli-idor-rbac-cors-ratelimit");
      skills.add("test-performance");
      skills.add("test-resilience");
    }
    if (has("firebase") || has("firebase-admin") || has("firebase-functions")) {
      types.add("firebase");
      frameworks.add("firebase");
      security.add("firebase-rules-auth-functions");
    }
    if (has("@supabase/supabase-js")) {
      frameworks.add("supabase");
      security.add("supabase-rls-policies");
    }
    if (has("prisma") || has("@prisma/client") || has("drizzle-orm") || has("mongoose") || has("typeorm")) {
      if (has("prisma") || has("@prisma/client")) frameworks.add("prisma");
      if (has("drizzle-orm")) frameworks.add("drizzle");
      if (has("mongoose")) frameworks.add("mongodb");
      security.add("database-injection-integrity");
    }

    // Test runners
    if (has("vitest")) runners.add("vitest");
    if (has("jest")) runners.add("jest");
    if (has("@playwright/test") || has("playwright")) runners.add("playwright");
    if (has("cypress")) runners.add("cypress");
    if (pkg.scripts?.test && runners.size === 0) runners.add("npm-test");
  }

  // --- Flutter / Dart ---
  const pubspecPaths = markers.get("pubspec.yaml") || [];
  for (const relPub of pubspecPaths) {
    const content = safeReadText(path.join(projectRoot, relPub));
    if (content.includes("flutter:")) {
      types.add("mobile");
      frameworks.add("flutter");
      runners.add("flutter-test");
      security.add("mobile-storage-deeplinks-cleartext");
      skills.add("test-parity");
      skills.add("test-resilience");
    } else {
      frameworks.add("dart");
      runners.add("dart-test");
    }
    if (content.includes("cloud_firestore") || content.includes("firebase_core")) {
      types.add("firebase");
      frameworks.add("firebase");
      security.add("firebase-rules-auth-functions");
    }
  }

  // --- Python (FastAPI / Django / Flask) ---
  const pyFiles = [
    ...(markers.get("pyproject.toml") || []),
    ...(markers.get("requirements.txt") || []),
    ...(markers.get("Pipfile") || [])
  ];
  if (pyFiles.length > 0 || markers.has("manage.py")) {
    types.add("backend");
    frameworks.add("python");
    security.add("backend-owasp-sqli-idor-rbac-cors-ratelimit");
    security.add("python-deserialization-shell-injection");
    skills.add("test-performance");
    skills.add("test-resilience");
    for (const relPy of pyFiles) {
      const txt = safeReadText(path.join(projectRoot, relPy)).toLowerCase();
      if (txt.includes("fastapi")) frameworks.add("fastapi");
      if (txt.includes("django")) frameworks.add("django");
      if (txt.includes("flask")) frameworks.add("flask");
      if (txt.includes("pytest")) runners.add("pytest");
      if (txt.includes("locust")) runners.add("locust");
    }
    if (markers.has("manage.py")) frameworks.add("django");
    if (!runners.has("pytest")) runners.add("python-unittest-or-pytest");
  }

  // --- Java / Kotlin / Spring Boot ---
  const javaFiles = [
    ...(markers.get("pom.xml") || []),
    ...(markers.get("build.gradle") || []),
    ...(markers.get("build.gradle.kts") || [])
  ];
  for (const relJava of javaFiles) {
    const txt = safeReadText(path.join(projectRoot, relJava));
    if (txt.includes("spring-boot") || txt.includes("org.springframework")) {
      types.add("backend");
      frameworks.add("spring-boot");
      security.add("spring-security-actuator-csrf-rbac");
      security.add("backend-owasp-sqli-idor-rbac-cors-ratelimit");
      skills.add("test-performance");
      skills.add("test-resilience");
    }
    if (relJava.endsWith("pom.xml")) runners.add("maven-junit");
    else runners.add("gradle-junit");
  }

  // --- Firebase explicit files ---
  if (
    markers.has("firebase.json") ||
    markers.has("firestore.rules") ||
    markers.has("storage.rules")
  ) {
    types.add("firebase");
    frameworks.add("firebase");
    security.add("firebase-rules-auth-functions");
    runners.add("firebase-emulator");
  }

  // --- Go / Rust / PHP / Docker ---
  if (markers.has("go.mod")) {
    types.add("backend");
    frameworks.add("go");
    runners.add("go-test");
    security.add("backend-owasp-sqli-idor-rbac-cors-ratelimit");
    skills.add("test-performance");
  }
  if (markers.has("Cargo.toml")) {
    frameworks.add("rust");
    runners.add("cargo-test");
  }
  if (markers.has("composer.json")) {
    types.add("backend");
    frameworks.add("php");
    security.add("backend-owasp-sqli-idor-rbac-cors-ratelimit");
  }
  if (markers.has("Dockerfile") || markers.has("docker-compose.yml") || markers.has("docker-compose.yaml")) {
    types.add("docker");
    frameworks.add("docker");
    security.add("docker-hardening");
    skills.add("test-resilience");
  }

  // --- Optional read-only SpecForge synergy (zero hard dependency) ---
  const candidateSpecDocs = [
    "docs/01_PRD.md",
    "docs/02_TRD.md",
    "docs/04_API.md",
    "docs/04_SCHEMA.md",
    "docs/08_TESTS.md",
    "docs/09_RBAC.md",
    "docs/PROD_CONFIG.md"
  ];
  for (const relDoc of candidateSpecDocs) {
    if (fs.existsSync(path.join(projectRoot, relDoc))) {
      profile.specForgeDocs.push(relDoc);
    }
  }

  profile.projectTypes = [...types];
  profile.frameworks = [...frameworks];
  profile.testRunners = [...runners];
  profile.securityChecklist = [...security];
  profile.recommendedSkills = [...skills];

  return profile;
}

function formatSessionMessage(profile) {
  if (profile.ignored) {
    return "[TestForge] Bypassed for this workspace (.test-ignore detected).";
  }
  if (profile.frameworks.length === 0 && profile.projectTypes.length === 0) {
    return `[TestForge] Active (Strict Mode — Option A). No framework detected yet (empty or generic workspace). Static security scanner ready at: ${profile.scannerCommand}`;
  }

  const lines = [
    "[TestForge] Project Profile Auto-Detected (Strict Mode — Option A: Auto-fix own syntax/compile errors; ALWAYS save docs/qa/TEST_FORGE_REPORT.md + summarize in chat and await user approval before fixing security flaws or existing bugs).",
    `- Project Types: ${profile.projectTypes.join(", ") || "generic"}`,
    `- Detected Stack: ${profile.frameworks.join(", ")}`,
    `- Test Runners: ${profile.testRunners.join(", ") || "auto-select"}`,
    `- Mandatory Security Focus: ${profile.securityChecklist.join(", ")}`,
    `- Active Skills Matrix: ${profile.recommendedSkills.join(", ")}`,
    `- Static Security Scanner: ${profile.scannerCommand}`
  ];

  if (profile.specForgeDocs.length > 0) {
    lines.push(
      `- Optional Spec Synergy (Read-Only): ${profile.specForgeDocs.join(", ")} detected — cross-check business rules & RBAC against these specs when auditing.`
    );
  }

  return lines.join("\n");
}

async function main() {
  const cliArgs = process.argv.slice(2);
  if (cliArgs.includes("--cli")) {
    const jsonMode = cliArgs.includes("--json");
    const targetArg = cliArgs.find((a) => !a.startsWith("-")) || process.cwd();
    const root = findProjectRoot(targetArg, []) || path.resolve(targetArg);
    const profile = detectProjectProfile(root);
    if (jsonMode) {
      process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
    } else {
      process.stdout.write(formatSessionMessage(profile) + "\n");
    }
    process.exit(0);
  }

  const payload = await readStdinJson();
  const root =
    (Array.isArray(payload.workspacePaths) && payload.workspacePaths[0]) ||
    payload.cwd ||
    null;

  if (!root || !fs.existsSync(root)) {
    return respondJson({});
  }

  const profile = detectProjectProfile(root);

  try {
    const profilesDir = path.join(getStateDir(), "profiles");
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.writeFileSync(
      path.join(profilesDir, `${hashString(path.resolve(root))}.json`),
      JSON.stringify(profile, null, 2),
      "utf8"
    );
  } catch {
    // Non-fatal cache write error
  }

  return respondJson({
    injectSteps: [
      {
        systemMessage: {
          systemMessage: formatSessionMessage(profile)
        }
      }
    ]
  });
}

if (isMainModule(import.meta.url)) {
  main().catch(() => respondJson({}));
}
