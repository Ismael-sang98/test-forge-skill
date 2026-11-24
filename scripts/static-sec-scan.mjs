#!/usr/bin/env node
/**
 * TestForge Multi-Stack Static Security Scanner (SAST + Secrets + Config)
 *
 * Usage:
 *   node scripts/static-sec-scan.mjs [targetDir] [--json]
 *
 * Covers: Web (Next.js/React), Mobile (Flutter/React Native),
 *         Backend (Node.js/Python/Spring Boot), Firebase Rules, Docker, .env hygiene.
 * Zero external dependencies. Deterministic Security Score (0-100).
 */

import fs from "node:fs";
import path from "node:path";
import { IGNORED_DIRS, isMainModule } from "./lib/utils.mjs";

const MAX_FILE_BYTES = 512 * 1024;
const PLACEHOLDER_RE =
  /(EXAMPLE|DUMMY|FAKE|PLACEHOLDER|REPLACE_ME|YOUR_[A-Z0-9_]+|CHANGEME|TEST_KEY|xxxx|00000000)/i;

const SCANNABLE_EXTS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".dart", ".java", ".kt", ".swift",
  ".go", ".rs", ".php", ".rb", ".cs",
  ".vue", ".svelte", ".rules", ".xml", ".plist",
  ".yml", ".yaml", ".properties", ".json", ".sql", ".sh"
]);

const SCANNABLE_BASENAMES = new Set([
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  "firestore.rules", "storage.rules", "AndroidManifest.xml", "Info.plist"
]);

const SEVERITY_WEIGHT = { P0: 25, P1: 12, P2: 5, P3: 2 };

const RULES = [
  // --- P0: Secrets & Catastrophic Auth/Rules ---
  {
    id: "SEC-001",
    severity: "P0",
    category: "Secrets",
    title: "Hardcoded Private Key (PEM)",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    fix: "Remove private key from source control, rotate immediately, and load via Secret Manager / environment variable."
  },
  {
    id: "SEC-002",
    severity: "P0",
    category: "Secrets",
    title: "Hardcoded Cloud / Payment / VCS Secret Token",
    regex: /\b(?:AKIA[0-9A-Z]{16}|[rs]k_live_[0-9a-zA-Z]{16,}|ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{30,}|xox[baprs]-[0-9a-zA-Z-]{10,}|sk-ant-[a-zA-Z0-9_-]{20,}|sk-proj-[a-zA-Z0-9_-]{20,})\b/,
    fix: "Revoke/rotate the exposed token and inject it at runtime through environment variables."
  },
  {
    id: "SEC-003",
    severity: "P0",
    category: "Secrets",
    title: "Hardcoded Remote Database Password in Connection URI",
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s"'`]+:[^@\s"'`]{6,}@(?!localhost\b|127\.0\.0\.1\b|0\.0\.0\.0\b|postgres\b|mysql\b|redis\b|mongo\b|db\b)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i,
    fix: "Store database credentials in secret environment variables (DATABASE_URL) outside the repository."
  },
  {
    id: "SEC-004",
    severity: "P0",
    category: "Firebase",
    title: "Unrestricted Public Write Access in Firebase Rules",
    fileFilter: (f) => /(firestore|storage)\.rules$/i.test(f),
    regex: /allow\s+(?:read\s*,\s*write|write\s*,\s*read|write)\s*:\s*if\s+true\s*;/i,
    fix: "Default-deny all access and enforce request.auth != null, ownership, RBAC claims, and schema validation."
  },
  {
    id: "SEC-005",
    severity: "P0",
    category: "Next.js / React",
    title: "Sensitive Secret Exposed via NEXT_PUBLIC_ Environment Variable",
    fileFilter: (f) => /\.(js|jsx|ts|tsx|mjs|cjs|env.*)$/i.test(f),
    regex: /\bNEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE|PASSWORD|SERVICE_ROLE|ADMIN_KEY|DB_URL)\b/,
    fix: "Remove NEXT_PUBLIC_ prefix so the secret stays strictly server-side and is never bundled into client JavaScript."
  },

  // --- P1: High-Severity Injection, Auth, Execution & Transport ---
  {
    id: "SEC-006",
    severity: "P1",
    category: "Injection",
    title: "Potential SQL Injection via Dynamic String Interpolation / Concatenation",
    fileFilter: (f) => /\.(js|ts|mjs|cjs|py|java|kt|php|go|rb)$/i.test(f),
    regex: /(?:query|execute|exec|raw|prepareStatement|createNativeQuery)\s*\(\s*(?:`[^`]*\$\{[^}]+\}[^`]*`|f["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*\{[^}]+\}|["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)[^"']*["']\s*\+)/i,
    fix: "Use parameterized queries / prepared statements or an ORM query builder with bound parameters."
  },
  {
    id: "SEC-007",
    severity: "P1",
    category: "Command Injection",
    title: "Unsafe Shell Execution (eval / exec / os.system / shell=True)",
    fileFilter: (f) => /\.(js|jsx|ts|tsx|mjs|cjs|py)$/i.test(f),
    regex: /(?:\beval\s*\(|\bnew\s+Function\s*\(|\bchild_process['"]?\)\.exec\s*\(|\bos\.system\s*\(|subprocess\.(?:run|Popen|call)\s*\([^)]*shell\s*=\s*True)/,
    fix: "Avoid eval/shell invocation; use execFile/spawn or subprocess with an explicit argument array and shell=False."
  },
  {
    id: "SEC-008",
    severity: "P1",
    category: "Deserialization",
    title: "Unsafe Python Deserialization (pickle.loads / yaml.load without SafeLoader)",
    fileFilter: (f) => /\.py$/i.test(f),
    regex: /(?:\bpickle\.loads?\s*\(|\byaml\.load\s*\((?![^)]*SafeLoader)[^)]*\))/,
    fix: "Use JSON or yaml.safe_load() instead of pickle or unrestricted yaml.load()."
  },
  {
    id: "SEC-009",
    severity: "P1",
    category: "XSS",
    title: "Unsanitized HTML Injection (dangerouslySetInnerHTML / innerHTML / v-html)",
    fileFilter: (f) => /\.(js|jsx|ts|tsx|vue|svelte)$/i.test(f),
    regex: /(?:\bdangerouslySetInnerHTML\b|\.innerHTML\s*=|\bv-html\s*=)/,
    fix: "Render text safely via framework escaping or sanitize strictly with DOMPurify before rendering HTML."
  },
  {
    id: "SEC-010",
    severity: "P1",
    category: "Auth / JWT",
    title: "JWT Signature Verification Disabled or Weak Algorithm ('none')",
    fileFilter: (f) => /\.(js|ts|py|java|kt|go)$/i.test(f),
    regex: /(?:verify_signature['"]?\s*:\s*False|algorithms\s*=\s*\[[^\]]*['"]none['"]|jwt\.decode\s*\([^)]*verify\s*=\s*False|ignoreExpiration\s*:\s*true)/i,
    fix: "Always verify JWT signatures with an explicit strong algorithm allowlist (e.g., RS256/ES256/HS256) and check exp."
  },
  {
    id: "SEC-011",
    severity: "P1",
    category: "CORS",
    title: "Wildcard CORS Origin Combined with Credentials",
    fileFilter: (f) => /\.(js|ts|py|java|kt|yml|yaml|properties)$/i.test(f),
    regex: /(?:origin\s*:\s*['"]\*['"][\s\S]{0,120}credentials\s*:\s*true|credentials\s*:\s*true[\s\S]{0,120}origin\s*:\s*['"]\*['"]|allow_origins\s*=\s*\[\s*['"]\*['"]\s*\][\s\S]{0,120}allow_credentials\s*=\s*True)/i,
    fix: "Replace '*' with an explicit allowlist of trusted frontend origins when credentials are enabled."
  },
  {
    id: "SEC-012",
    severity: "P1",
    category: "Spring Boot",
    title: "Spring Boot Actuator Endpoints Broadly Exposed",
    fileFilter: (f) => /(application\.(properties|ya?ml)|Security.*\.java|Security.*\.kt)$/i.test(f),
    regex: /(?:management\.endpoints\.web\.exposure\.include\s*[:=]\s*['"]?\*['"]?|requestMatchers\s*\([^)]*\/actuator\/\*\*[^)]*\)\.permitAll\s*\()/,
    fix: "Expose only /actuator/health (without details) publicly and protect all other actuator endpoints behind ADMIN auth."
  },
  {
    id: "SEC-013",
    severity: "P1",
    category: "TLS / Transport",
    title: "TLS Certificate Verification Disabled (MITM Risk)",
    fileFilter: (f) => /\.(js|ts|py|dart|java|kt|go)$/i.test(f),
    regex: /(?:NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0['"]?|rejectUnauthorized\s*:\s*false|verify\s*=\s*False\b|badCertificateCallback\s*=\s*\([^)]*\)\s*=>\s*true)/,
    fix: "Keep TLS certificate validation enabled in production to prevent Man-in-the-Middle attacks."
  },
  {
    id: "SEC-014",
    severity: "P1",
    category: "Mobile Security",
    title: "Cleartext HTTP Traffic Allowed in Mobile Manifest",
    fileFilter: (f) => /(AndroidManifest\.xml|Info\.plist)$/i.test(f),
    regex: /(?:android:usesCleartextTraffic\s*=\s*["']true["']|<key>NSAllowsArbitraryLoads<\/key>\s*<true\s*\/>)/,
    fix: "Disable cleartext HTTP traffic in release builds and enforce HTTPS/ATS for all network requests."
  },
  {
    id: "SEC-015",
    severity: "P1",
    category: "Mobile Security",
    title: "Sensitive Token/Password Stored in Unencrypted Mobile Storage",
    fileFilter: (f) => /\.(dart|js|jsx|ts|tsx)$/i.test(f),
    regex: /(?:SharedPreferences|AsyncStorage)[\s\S]{0,80}(?:setString|setItem)\s*\(\s*['"][^'"]*(?:token|jwt|password|secret|pin|refresh)/i,
    fix: "Use flutter_secure_storage (Flutter) or expo-secure-store / react-native-keychain (React Native) for secrets."
  },

  // --- P2: Medium-Severity Hardening & Hygiene ---
  {
    id: "SEC-016",
    severity: "P2",
    category: "Cryptography",
    title: "Weak Hash Algorithm (MD5 / SHA1) or Non-Cryptographic Randomness",
    fileFilter: (f) => /\.(js|ts|py|dart|java|kt|php)$/i.test(f),
    regex: /(?:createHash\s*\(\s*['"](?:md5|sha1)['"]\)|hashlib\.(?:md5|sha1)\s*\(|MessageDigest\.getInstance\s*\(\s*['"](?:MD5|SHA-1)['"]\))/,
    fix: "Use bcrypt/Argon2/scrypt for passwords and SHA-256/SHA-512 (or crypto.randomBytes) for integrity and tokens."
  },
  {
    id: "SEC-017",
    severity: "P2",
    category: "Configuration",
    title: "Debug Mode Explicitly Enabled in Code/Config",
    fileFilter: (f) => /\.(py|properties|yml|yaml|ts|js)$/i.test(f),
    regex: /^\s*(?:DEBUG\s*=\s*True|app\.run\([^)]*debug\s*=\s*True|logging\.level\.root\s*[:=]\s*DEBUG)/m,
    fix: "Load debug flags from environment variables and default to false in production."
  },
  {
    id: "SEC-018",
    severity: "P2",
    category: "Firebase",
    title: "Public Unauthenticated Read Rule in Firebase Rules",
    fileFilter: (f) => /(firestore|storage)\.rules$/i.test(f),
    regex: /allow\s+read\s*:\s*if\s+true\s*;/i,
    fix: "Verify whether this collection/bucket is intentionally public catalog data; otherwise require request.auth != null."
  },
  {
    id: "SEC-019",
    severity: "P2",
    category: "Docker",
    title: "Docker Container Configured as Root or Unpinned :latest Tag",
    fileFilter: (f) => path.basename(f) === "Dockerfile",
    regex: /(?:^\s*USER\s+root\b|^\s*FROM\s+[^\s:]+:latest\b)/m,
    fix: "Pin base images to an explicit version/digest and run the container with a dedicated non-root USER."
  },
  {
    id: "SEC-020",
    severity: "P2",
    category: "Secrets",
    title: "Hardcoded Fallback Secret in Code (|| 'secret')",
    fileFilter: (f) => /\.(js|ts|mjs|cjs|py)$/i.test(f),
    regex: /(?:JWT_SECRET|SESSION_SECRET|AUTH_SECRET|SECRET_KEY|API_SECRET)\s*(?:\|\||\?\?|or)\s*['"][^'"]{3,}['"]/i,
    fix: "Fail fast at startup if required security secrets are missing instead of falling back to a hardcoded string."
  },

  // --- P3: Low / Best Practice ---
  {
    id: "SEC-021",
    severity: "P3",
    category: "Logging / Leakage",
    title: "Potential Sensitive Credential Logged to Console",
    fileFilter: (f) => /\.(js|jsx|ts|tsx|dart|py|java|kt)$/i.test(f),
    regex: /(?:console\.log|print|logger\.(?:info|debug))\s*\([^)]*(?:password|secret|authorization|accessToken|refreshToken|privateKey)/i,
    fix: "Redact credentials, tokens, and PII before emitting application logs."
  }
];

function shouldScanFile(filePath) {
  const base = path.basename(filePath);
  if (SCANNABLE_BASENAMES.has(base)) return true;
  if (/^\.env(\..+)?$/i.test(base) && !/example|sample|template/i.test(base)) return true;
  const ext = path.extname(filePath).toLowerCase();
  return SCANNABLE_EXTS.has(ext);
}

function walkFiles(rootDir) {
  const results = [];
  function walk(dir, depth) {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name === "docs" || entry.name === "Docs") {
          continue;
        }
        walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const fullPath = path.join(dir, entry.name);
        if (shouldScanFile(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  }
  walk(rootDir, 0);
  return results;
}

function findLineNumber(content, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function getLineText(content, index) {
  const start = content.lastIndexOf("\n", index) + 1;
  const end = content.indexOf("\n", index);
  return content.slice(start, end === -1 ? content.length : end).trim().slice(0, 140);
}

export function runStaticSecurityScan(targetDir) {
  const root = path.resolve(targetDir || process.cwd());
  const files = walkFiles(root);
  const findings = [];
  const seen = new Set();

  // Check .env hygiene against .gitignore
  const envPath = path.join(root, ".env");
  const gitignorePath = path.join(root, ".gitignore");
  if (fs.existsSync(envPath)) {
    const gitignore = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, "utf8")
      : "";
    if (!/^\s*\.env\b/m.test(gitignore)) {
      findings.push({
        id: "SEC-ENV",
        severity: "P0",
        category: "Secrets Hygiene",
        title: ".env File Exists Without .env Entry in .gitignore",
        file: ".env",
        line: 1,
        evidence: ".env present at project root and not matched in .gitignore",
        fix: "Add `.env` and `.env.*` (except `!.env.example`) to `.gitignore` immediately."
      });
    }
  }

  // Check Dockerfiles missing USER directive
  for (const fullPath of files) {
    const relPath = path.relative(root, fullPath);
    const isTestFile = /(\.test\.|\.spec\.|__tests__|\/tests?\/)/i.test(relPath);

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE_BYTES) continue;

    let content;
    try {
      content = fs.readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }

    if (path.basename(fullPath) === "Dockerfile" && !/^\s*USER\s+(?!root\b)\S+/m.test(content)) {
      findings.push({
        id: "SEC-DOCKER-USER",
        severity: "P2",
        category: "Docker",
        title: "Dockerfile Missing Non-Root USER Directive",
        file: relPath,
        line: 1,
        evidence: "No non-root USER instruction found in Dockerfile",
        fix: "Create a non-privileged user and add `USER <nonroot>` before CMD/ENTRYPOINT."
      });
    }

    for (const rule of RULES) {
      if (rule.fileFilter && !rule.fileFilter(relPath)) continue;
      // Avoid noisy P2/P3 matches inside test fixtures
      if (isTestFile && (rule.severity === "P2" || rule.severity === "P3")) continue;

      const globalRe = new RegExp(
        rule.regex.source,
        rule.regex.flags.includes("g") ? rule.regex.flags : rule.regex.flags + "g"
      );

      let match;
      let matchCount = 0;
      while ((match = globalRe.exec(content)) !== null && matchCount < 5) {
        const lineText = getLineText(content, match.index);
        if (PLACEHOLDER_RE.test(lineText)) continue;
        if (isTestFile && /mock|stub|fixture|fake/i.test(lineText)) continue;

        const lineNum = findLineNumber(content, match.index);
        const dedupeKey = `${rule.id}:${relPath}:${lineNum}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        matchCount++;

        findings.push({
          id: rule.id,
          severity: rule.severity,
          category: rule.category,
          title: rule.title,
          file: relPath,
          line: lineNum,
          evidence: lineText,
          fix: rule.fix
        });
      }
    }
  }

  const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  let penalty = 0;
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
    penalty += SEVERITY_WEIGHT[f.severity] || 2;
  }

  const securityScore = Math.max(0, 100 - penalty);

  return {
    scannedRoot: root,
    filesScanned: files.length,
    securityScore,
    counts,
    findings
  };
}

function formatMarkdown(report) {
  const lines = [
    `# TestForge Static Security Scan`,
    `- **Root:** \`${report.scannedRoot}\``,
    `- **Files Scanned:** ${report.filesScanned}`,
    `- **Static Security Score:** **${report.securityScore}/100**`,
    `- **Summary:** P0: ${report.counts.P0} | P1: ${report.counts.P1} | P2: ${report.counts.P2} | P3: ${report.counts.P3}`,
    ""
  ];

  if (report.findings.length === 0) {
    lines.push("No static security issues detected by automated heuristics.");
    return lines.join("\n");
  }

  lines.push("| ID | Sev | Category | Location | Issue | Recommended Fix |");
  lines.push("| :--- | :---: | :--- | :--- | :--- | :--- |");
  for (const f of report.findings) {
    lines.push(
      `| ${f.id} | **${f.severity}** | ${f.category} | \`${f.file}:${f.line}\` | ${f.title} | ${f.fix} |`
    );
  }
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const targetArg = args.find((a) => !a.startsWith("-")) || process.cwd();
  const report = runStaticSecurityScan(targetArg);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(formatMarkdown(report) + "\n");
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
