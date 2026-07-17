# Crapper Keeper — Browser Extension

## Overview
A Chrome (MV3) extension that saves webpages into the Crapper Keeper webapp's data. Right-click any page/selection/image/link to save it as a note. It uses the same Firebase project (`davidthegnomadorg`) and your Google account — but signs in **independently**, because browser login state is scoped per-origin and can't be shared between the webapp (`davidthegnomadorg.web.app`) and the extension (`chrome-extension://…`).

---

## Features

| Feature | Description |
|---------|-------------|
| **Save page** | Right-click → "Save to Crapper Keeper" — saves page title + URL |
| **Save selection** | Right-click selected text — saves highlighted text as content |
| **Save image** | Right-click image — saves image URL |
| **Save link** | Right-click link — saves link href + source page |
| **Google sign-in** | `chrome.identity` → Firebase session (own login, remembered) |
| **Config popup** | Click icon → sign in + set default notebook/chapter |

---

## Architecture

```
extension/
├── manifest.json          # MV3 manifest (pinned key, identity/storage/contextMenus)
├── background.js          # Service worker: menus, auth, Firestore REST
├── popup.html             # Sign-in + settings popup
├── popup.js               # Popup logic (messages the service worker)
├── icons/                 # 16 / 48 / 128 px
└── plan.md
```

### Auth flow (no bundled SDK — MV3 forbids remote scripts)
```
Sign in (popup button or first right-click)
  → chrome.identity.launchWebAuthFlow (Google implicit token flow, existing Web OAuth client)
  → Google access token
  → accounts:signInWithIdp (Identity Toolkit REST)   → Firebase idToken + refreshToken + uid
  → cache in chrome.storage.local (refresh via securetoken.googleapis.com when expired)
```

### Save flow
```
Right-click → background.js
  → ensureAuth(interactive)   (first use opens Google sign-in)
  → getDefaultTarget(uid)     (stored prefs, else first notebook/chapter)
  → POST pages via Firestore REST with Bearer <firebase idToken>
  → toolbar badge ✓ / !
```

### Storage
- `chrome.storage.sync`: `notebookId`, `sectionId` (default save target)
- `chrome.storage.local`: `fbIdToken`, `fbRefreshToken`, `fbExpiry`, `uid`

### Firestore document (pages)
`{ userId, sectionId, parentPageId:null, title, contentJson, contentPlain, url, position, isCollapsed, treePath, createdAt, updatedAt }` — matches the webapp schema so saved notes render in the editor.

---

## One-time OAuth setup
Add the extension's redirect URI to the existing Web OAuth client (`987094737269-…`):
```
https://bnphbmoakfepbbofcccekiainldenffm.chromiumapp.org/
```
The extension ID is pinned by the manifest `key`, so this URL is stable.

---

## Build / test steps
1. Add redirect URI to the Web OAuth client (above)
2. `chrome://extensions` → Developer mode → Load unpacked → select `extension/`
3. Click CK icon → Sign in with Google
4. Right-click a page → "Save to Crapper Keeper" → confirm ✓ badge
5. Open the webapp → confirm the note appears in the chosen notebook/chapter

## Known limits / TODO
- Chrome/Edge only (Firefox uses a different `identity` redirect scheme).
- Firestore composite indexes for `userId + notebookId + position` and `userId + position` must exist (already deployed with the webapp).
- No offline queue — a save while offline just flashes `!`.
