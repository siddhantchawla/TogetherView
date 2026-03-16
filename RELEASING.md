# Releasing TogetherView

This document explains how to ship a new version of TogetherView to the Chrome Web Store.

---

## Overview

TogetherView uses a **tag-based release model**. You merge to `main` freely and only trigger a release when you're ready, by pushing a version tag. Once a tag is pushed, the CD pipeline handles everything automatically:

- Bumps the version in `extension/manifest.json`
- Commits that change back to `main`
- Zips the extension
- Creates a GitHub Release with the `.zip` attached
- Submits the new version to the Chrome Web Store

CI runs on every pull request to catch lint errors and manifest issues before they land in `main`.

---

## One-time setup

You need to add **4 GitHub secrets** before the CD pipeline can publish to the Chrome Web Store.

### Required secrets

| Secret name             | Description                                         |
| ----------------------- | --------------------------------------------------- |
| `CHROME_EXTENSION_ID`   | The extension's ID in the Chrome Web Store          |
| `CHROME_CLIENT_ID`      | OAuth 2.0 client ID from Google Cloud Console       |
| `CHROME_CLIENT_SECRET`  | OAuth 2.0 client secret from Google Cloud Console   |
| `CHROME_REFRESH_TOKEN`  | OAuth 2.0 refresh token for the Chrome Web Store API|

### How to get each secret

#### `CHROME_EXTENSION_ID`

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Click your extension.
3. The extension ID appears in the URL and on the item's detail page (e.g. `abcdefghijklmnopqrstuvwxyzabcdef`).

#### `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET`

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. Enable the **Chrome Web Store API**: _APIs & Services → Library → search "Chrome Web Store API" → Enable_.
4. Create OAuth credentials: _APIs & Services → Credentials → Create Credentials → OAuth client ID_.
   - Application type: **Desktop app**
   - Give it a name (e.g. `TogetherView CD`)
5. Copy the **Client ID** and **Client secret**.

#### `CHROME_REFRESH_TOKEN`

Run the following command and follow the interactive prompts. It will open a browser window for you to authorise access to the Chrome Web Store API and then print your refresh token.

```bash
npx chrome-webstore-upload-cli@latest init
```

When prompted, enter the **Client ID** and **Client secret** you just created.

### Adding secrets to GitHub

1. Go to your repository on GitHub.
2. Navigate to **Settings → Secrets and variables → Actions**.
3. Click **New repository secret** for each of the four secrets above.
4. Paste the value and save.

---

## How to ship a release

Once the secrets are configured, shipping a release is two commands:

```bash
git tag v1.0.1
git push origin v1.0.1
```

That's it. The CD pipeline takes over from there.

---

## What happens next (automatically)

After you push the tag, the CD pipeline:

1. **Checks out** the repository at that tag.
2. **Extracts** the version number from the tag (e.g. `v1.0.1` → `1.0.1`).
3. **Updates** `extension/manifest.json` with the new version.
4. **Commits and pushes** that change back to `main` with the message `chore: bump version to 1.0.1 [skip ci]`.
5. **Zips** the `extension/` folder into `togetherView-v1.0.1.zip`.
6. **Creates a GitHub Release** named `TogetherView v1.0.1` with the zip attached and auto-generated release notes.
7. **Submits** the zip to the Chrome Web Store for review.

Chrome Web Store review typically takes a few hours to a couple of days.

---

## Versioning convention

TogetherView follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):

| Change type                                      | Version bump |
| ------------------------------------------------ | ------------ |
| Bug fixes, small tweaks                          | `PATCH`      |
| New features, backwards-compatible changes       | `MINOR`      |
| Breaking changes (e.g. protocol changes)         | `MAJOR`      |

Examples:
- Fix a sync bug → `v1.0.1`
- Add guest count indicator → `v1.1.0`
- Redesign the sync protocol → `v2.0.0`

---

## CI on pull requests

Every pull request to `main` automatically runs:

- **Manifest validation** — checks that `extension/manifest.json` is valid JSON and contains all required fields
- **JS linting** — runs ESLint with `eslint:recommended` rules on all JS files in `extension/`

Fix any reported issues before merging.
