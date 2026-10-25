"use strict";
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const git = (args) => execFileSync("git", args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
const entries = git(["ls-files", "--stage", "-z"]).toString("utf8").split("\0").filter(Boolean);
if (!entries.length) throw new Error("No staged/tracked files to audit. Stage the source files first.");
const blockedPath = /(?:^|\/)(?:work|dist|node_modules|test-results|playwright-report|DerivedData|build|xcuserdata|xcuserdatad)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.netrc|AuthKey_[^/]*|ExportOptions\.plist)$|\.(?:p12|pfx|p8|pem|key|cer|crt|der|csr|p7b|p7c|keystore|jks|keychain(?:-db)?|mobileprovision|provisionprofile|xcconfig|xcuserstate|ipa|dmg|pkg|zip|log)$|\.(?:app|appex|dSYM|xcarchive|xcresult)(?:\/|$)/i;
const contentRules = [
  ["private key or certificate block", /-----BEGIN (?:[A-Z ]*PRIVATE KEY|CERTIFICATE)-----/],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["OpenAI-style API token", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ["hard-coded development team", /DEVELOPMENT_TEAM\s*=\s*["']?[A-Z0-9]{10}["']?\s*[;\r\n]/],
  ["absolute developer home path", /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//]
];
const localConfig = path.join(root, "work/Signing.generated.xcconfig");
const localTeam = fs.existsSync(localConfig)
  ? fs.readFileSync(localConfig, "utf8").match(/^DEVELOPMENT_TEAM\s*=\s*([A-Z0-9]{10})\s*$/m)?.[1]
  : undefined;
let total = 0;
const errors = [];
for (const entry of entries) {
  const match = entry.match(/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
  if (!match) throw new Error("Cannot parse Git index entry.");
  const [, mode, object, stage, name] = match;
  if (stage !== "0") { errors.push(`${name}: unresolved merge entry`); continue; }
  if (mode !== "100644" && mode !== "100755") { errors.push(`${name}: non-regular file`); continue; }
  if (blockedPath.test(name)) { errors.push(`${name}: local/signing/build file`); continue; }
  const bytes = git(["cat-file", "blob", object]);
  total += bytes.length;
  if (bytes.length > 10 * 1024 * 1024) errors.push(`${name}: file exceeds 10 MiB`);
  const content = bytes.toString("utf8");
  for (const [label, pattern] of contentRules) {
    if (pattern.test(content)) errors.push(`${name}: ${label}`);
  }
  if (localTeam && content.includes(localTeam)) errors.push(`${name}: local signing team metadata`);
}
if (errors.length) {
  console.error("Publication check failed (matched values are never printed):\n" + errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Publication check passed: ${entries.length} regular files, ${total} bytes; no signing assets or matching credentials in Git index.`);
}
