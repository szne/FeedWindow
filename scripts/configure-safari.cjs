// Correct the packager's containing-app identifier and apply the small host UI.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const project = path.join(root, "safari/Feed Window");
const pbx = path.join(project, "Feed Window.xcodeproj/project.pbxproj");
let source = fs.readFileSync(pbx, "utf8");
source = source.replaceAll('PRODUCT_BUNDLE_IDENTIFIER = "net.szkk.Feed-Window";', "PRODUCT_BUNDLE_IDENTIFIER = net.szkk.feedwindow;");
source = source.replace(/MACOSX_DEPLOYMENT_TARGET = [\d.]+;/g, "MACOSX_DEPLOYMENT_TARGET = 13.0;");
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
