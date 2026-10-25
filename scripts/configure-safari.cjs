// Correct the packager's containing-app identifier and apply the small host UI.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const project = path.join(root, "safari/Feed Window");
const pbx = path.join(project, "Feed Window.xcodeproj/project.pbxproj");
let source = fs.readFileSync(pbx, "utf8");
source = source.replaceAll('PRODUCT_BUNDLE_IDENTIFIER = "net.szkk.Feed-Window";', "PRODUCT_BUNDLE_IDENTIFIER = net.szkk.feedwindow;");
source = source.replace(/MACOSX_DEPLOYMENT_TARGET = [\d.]+;/g, "MACOSX_DEPLOYMENT_TARGET = 13.0;");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
source = source.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
const [major, minor, patch] = version.split(".").map(Number);
source = source.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${major * 10000 + minor * 100 + patch};`);
if (!source.includes("/* instagram.js */ =")) {
  const { createHash } = require("node:crypto");
  const identifier = (name) => createHash("sha256").update(`FeedWindow:${name}`).digest("hex").slice(0, 24).toUpperCase();
  const file = identifier("instagram.js:file");
  const build = identifier("instagram.js:resource");
  const contentFile = source.match(/([A-F0-9]{24}) \/\* content\.js \*\/ = \{isa = PBXFileReference;/)?.[1];
  const contentBuild = source.match(/([A-F0-9]{24}) \/\* content\.js in Resources \*\/ = \{isa = PBXBuildFile;/)?.[1];
  if (!contentFile || !contentBuild) throw new Error("Cannot locate extension resources in Xcode project.");
  source = source.replace("/* Begin PBXBuildFile section */", `/* Begin PBXBuildFile section */\n\t\t${build} /* instagram.js in Resources */ = {isa = PBXBuildFile; fileRef = ${file} /* instagram.js */; };`);
  source = source.replace("/* Begin PBXFileReference section */", `/* Begin PBXFileReference section */\n\t\t${file} /* instagram.js */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.javascript; name = instagram.js; path = ../../../extension/instagram.js; sourceTree = "<group>"; };`);
  source = source.replace(`${contentFile} /* content.js */,`, `${contentFile} /* content.js */,\n\t\t\t\t${file} /* instagram.js */,`);
  source = source.replace(`${contentBuild} /* content.js in Resources */,`, `${contentBuild} /* content.js in Resources */,\n\t\t\t\t${build} /* instagram.js in Resources */,`);
}
fs.writeFileSync(pbx, source);
const host = path.join(project, "Feed Window");
const resources = path.join(host, "Resources");
for (const file of ["Main.html", "Style.css", "Script.js"]) {
  fs.copyFileSync(path.join(root, "scripts/host", file), path.join(resources, file === "Main.html" ? "Base.lproj/Main.html" : file));
}
if (process.env.FEED_WINDOW_RESOLVED_SIGNING === "development") {
  const main = path.join(resources, "Base.lproj/Main.html");
  let html = fs.readFileSync(main, "utf8");
  html = html.replace(/<p class="note">[\s\S]*?<\/p>/, '<p class="note">Apple Development証明書で署名した開発版です。<br>Safari → 設定 → 拡張機能 → Feed Windowをオンにし、<br>X・Instagramへのアクセスを許可してください。<br>「署名されていない拡張機能を許可」は不要です。</p>');
  fs.writeFileSync(main, html);
}
fs.copyFileSync(path.join(root, "extension/icons/icon-128.png"), path.join(resources, "Icon.png"));
const iconset = path.join(host, "Assets.xcassets/AppIcon.appiconset");
const content = JSON.parse(fs.readFileSync(path.join(iconset, "Contents.json"), "utf8"));
for (const item of content.images) {
  const size = parseInt(item.size, 10) * parseInt(item.scale, 10);
  // AppKit's lockFocus can produce a 2x representation. sips ensures exact asset dimensions.
  const { execFileSync } = require("node:child_process");
  execFileSync("sips", ["-z", String(size), String(size), path.join(root, `extension/icons/icon-${size === 64 ? 128 : size}.png`), "--out", path.join(iconset, item.filename)], { stdio: "ignore" });
}
const storyboard = path.join(host, "Base.lproj/Main.storyboard");
fs.writeFileSync(storyboard, fs.readFileSync(storyboard, "utf8").replaceAll('width="425" height="325"', 'width="560" height="540"'));
