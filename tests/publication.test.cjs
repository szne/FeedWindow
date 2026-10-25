const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const script = path.resolve(__dirname, "../scripts/check-publication.cjs");
function repository(t) {
  const base = path.resolve(__dirname, "../work");
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, "publication-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git(["init", "-q"]);
  return {
    root, git,
    stage(name, value) {
      const file = path.join(root, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, value);
      git(["add", "-f", "--", name]);
    },
    audit() { return spawnSync(process.execPath, [script, root], { encoding: "utf8" }); }
  };
}
test("publication audit reads staged bytes, including force-added ignored signing files", (t) => {
  const repo = repository(t);
  repo.stage("source.js", "console.log('safe source');\n");
  fs.writeFileSync(path.join(repo.root, "source.js"), ["-----BEGIN ", "PRIVATE KEY-----"].join(""));
  assert.equal(repo.audit().status, 0);
  repo.stage("work/Signing.generated.xcconfig", "local config");
  const result = repo.audit();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /local\/signing\/build file/);
});
test("publication audit rejects key material and tokens without printing the matching value", (t) => {
  const repo = repository(t);
  const token = ["ghp_", "A".repeat(36)].join("");
  repo.stage("accidental.txt", Buffer.from(["\0", token, "\n", "-----BEGIN ", "PRIVATE KEY-----"].join("")));
  const result = repo.audit();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub token/);
  assert.match(result.stderr, /private key/);
  assert.equal(result.stderr.includes(token), false);
});
test("publication audit detects local team metadata and rejects symlinks", (t) => {
  const repo = repository(t);
  const team = ["ABCD", "123456"].join("");
  fs.mkdirSync(path.join(repo.root, "work"));
  fs.writeFileSync(path.join(repo.root, "work/Signing.generated.xcconfig"), "DEVELOPMENT_TEAM = " + team + "\n");
  repo.stage("notes.md", "My team is " + team);
  assert.match(repo.audit().stderr, /local signing team metadata/);
  repo.git(["rm", "--cached", "notes.md"]);
  fs.symlinkSync("work/Signing.generated.xcconfig", path.join(repo.root, "link"));
  repo.git(["add", "link"]);
  assert.match(repo.audit().stderr, /non-regular file/);
});
