# Security and publishing

Feed Window is published as source code. Sign Safari builds on your own Mac with your own development identity. This repository does not distribute signing certificates, private keys, provisioning profiles, or signed app bundles.

## Files that stay local

- Certificate/key exports: `.p12`, `.pfx`, `.p8`, `.pem`, `.key`, `.cer`, `.crt`, `.der`, `.csr` and keychains.
- Provisioning profiles, personal `.xcconfig` files, Xcode user data, environment files and credentials.
- `work/`, `dist/`, build logs, app bundles and archives.

The build reads an existing signing identity through macOS tools. It uses the private key through `codesign`; it does not export the private key. `work/Signing.generated.xcconfig` contains local signing settings and is ignored by Git. Certificates and Team IDs are not a substitute for the private key, but personal signing metadata is also excluded from published configuration.

## Before committing or pushing

```sh
git add <reviewed-source-files>
npm run check:publication
git diff --cached --stat
git diff --cached
```

`check:publication` scans the exact Git index, rejects signing/build/credential file paths, key/certificate blocks and common token formats, and detects hard-coded developer Team IDs. When a local generated signing configuration exists, it also checks that its Team ID has not entered staged content. `.gitignore` alone cannot protect files that have already been staged or tracked.

Use a dedicated scanner such as [Gitleaks](https://github.com/gitleaks/gitleaks) for the full commit history before publishing. The included check is an additional safeguard, not a guarantee that arbitrary secrets can always be detected. CI runs the source checks and tests without signing credentials, and does not upload app bundles.

If a credential is exposed, revoke or rotate it first; deleting the current file does not remove it from Git history. Do not paste a private key or token into a public issue.

## Extension data

The extension stores its settings and per-service usage counters in local browser extension storage. It does not send analytics or page content to a backend. Website access is limited to X, the legacy Twitter domain, and Instagram. These permissions allow the content script to hide the selected feeds and pause their media.
