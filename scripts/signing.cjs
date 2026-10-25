// Resolve an existing signing identity; never create/export a key or contact Apple.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const requested = process.env.FEED_WINDOW_SIGNING || "auto";
if (!["auto", "development", "adhoc"].includes(requested)) throw new Error("FEED_WINDOW_SIGNING must be auto, development, or adhoc");
const output = execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
const candidates = [...output.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"(Apple Development:[^"]+)"/gm)].map((match) => ({ hash: match[1], name: match[2] }));
const selected = process.env.FEED_WINDOW_IDENTITY
  ? candidates.find((item) => item.hash === process.env.FEED_WINDOW_IDENTITY)
  : candidates.length === 1 ? candidates[0] : undefined;
if (requested === "development" && !selected) {
  throw new Error("Select an existing Apple Development identity in Xcode, or set FEED_WINDOW_IDENTITY to its fingerprint.");
}
let config;
let mode;
if (requested !== "adhoc" && selected) {
  const pem = execFileSync("/usr/bin/security", ["find-certificate", "-c", selected.name, "-p"]);
  const subject = execFileSync("/usr/bin/openssl", ["x509", "-noout", "-subject", "-nameopt", "sep_multiline"], { input: pem, encoding: "utf8" });
  const team = subject.match(/^\s*OU\s*=\s*([A-Z0-9]{10})\s*$/m)?.[1];
  if (!team) throw new Error("Cannot determine the signing certificate's team.");
  config = `CODE_SIGN_STYLE = Automatic\nCODE_SIGN_IDENTITY = Apple Development\nDEVELOPMENT_TEAM = ${team}\nCODE_SIGNING_ALLOWED = YES\n`;
  mode = "development";
} else {
  config = "CODE_SIGN_IDENTITY = -\nDEVELOPMENT_TEAM =\nCODE_SIGNING_ALLOWED = YES\n";
  mode = "adhoc";
}
fs.mkdirSync(path.join(root, "work"), { recursive: true });
fs.writeFileSync(path.join(root, "work/Signing.generated.xcconfig"), config);
// stdout is deliberately only the non-sensitive build mode.
console.log(mode);
