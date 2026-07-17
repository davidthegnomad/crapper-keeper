# Crapper Keeper — Chrome Extension

**Get your 💩 together.** Right-click any webpage to save it directly to your Crapper Keeper notebooks. Uses the same Firebase project and Google account as the webapp, but signs in independently (a browser login can't be shared across origins).

## One-time setup (required before it works)

The extension signs in with Google using the project's existing **Web OAuth client**. You just need to authorize the extension's redirect URL on that client:

1. Google Cloud Console → **APIs & Services → Credentials**
2. Open the OAuth 2.0 Web client `987094737269-…` (project `davidthegnomadorg`)
3. Under **Authorized redirect URIs**, add:
   ```
   https://bnphbmoakfepbbofcccekiainldenffm.chromiumapp.org/
   ```
4. Save (changes can take a few minutes to propagate)

> The extension ID is pinned to `bnphbmoakfepbbofcccekiainldenffm` via the `key` field in `manifest.json`, so the redirect URL above stays stable across reinstalls.

## Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The purple CK icon appears in your toolbar

## Usage

### Sign in
Click the CK toolbar icon → **Sign in with Google**. A Google window opens once; after that the session is remembered (and auto-refreshed).

### Right-click to save
- **Any page** → Right-click → "Save to Crapper Keeper" — saves page title + URL
- **Selected text** → Highlight text → Right-click → "Save selection to CK" — saves quoted text + source link
- **An image** → Right-click image → "Save image to CK" — saves image URL
- **A link** → Right-click link → "Save link to CK" — saves link URL + source page

A green `✓` badge on the toolbar icon confirms the save; a red `!` means it failed (check the service-worker console).

### Configure default notebook
Click the CK icon to choose which notebook and chapter new saves go to. If you don't set one, saves go to your first notebook/chapter.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome MV3 config (pinned `key`, `identity` + `storage` + `contextMenus`) |
| `background.js` | Service worker: context menus, Google sign-in, Firestore REST save |
| `popup.html` | Settings popup (sign-in + pick default notebook/chapter) |
| `popup.js` | Popup logic — talks to the service worker |
| `icons/` | Purple CK icons (16, 48, 128px) |

## How auth works

1. `chrome.identity.launchWebAuthFlow` → Google sign-in (implicit `token` flow, existing Web client)
2. Google access token → Firebase session via Identity Toolkit `accounts:signInWithIdp`
3. Firebase ID token (+ refresh token) cached in `chrome.storage.local`; refreshed via `securetoken.googleapis.com` when expired
4. Firestore reads/writes over REST with `Authorization: Bearer <firebase id token>` — so `request.auth.uid` matches your data and the security rules pass

No Firebase SDK is bundled (MV3 forbids remote scripts); everything is plain `fetch`.

## Development

```bash
# Reload after code changes:  chrome://extensions → refresh icon on the CK card
# Background logs:            chrome://extensions → "service worker" link on the CK card
```
