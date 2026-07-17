# Crapper Keeper — Browser Extension

## Overview
A Chrome extension that syncs with the Crapper Keeper webapp. Right-click any webpage to save it as a note. Uses the same Firebase project and Google Auth — if you're signed into the webapp, the extension recognizes you automatically.

---

## Features

| Feature | Description |
|---------|-------------|
| **Save page** | Right-click → "Save to Crapper Keeper" — saves page title + URL |
| **Save selection** | Right-click selected text → "Save selection to Crapper Keeper" — saves highlighted text as content |
| **Save image** | Right-click image → "Save image to Crapper Keeper" — saves image URL and alt text |
| **Save link** | Right-click link → "Save link to Crapper Keeper" — saves link text + href |
| **Auto-auth** | Uses same Firebase Auth as webapp — no separate login needed |
| **Config popup** | Click extension icon → set default notebook + chapter for saves |

---

## Architecture

```
extension/
├── manifest.json          # Chrome MV3 manifest
├── background.js          # Service worker: context menus, Firebase, save logic
├── popup.html             # Settings popup
├── popup.js               # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── plan.md
```

### contextMenus (created on install)
```
"Save to Crapper Keeper"        ← page context
"Save selection to CK"          ← selection context  
"Save image to CK"              ← image context
"Save link to CK"               ← link context
```

### Save flow
```
User right-clicks → background.js receives menu click
  → Gets page/selection/image/link info
  → Authenticates with Firebase (silent, no popup)
  → Creates page in Firestore under user's default notebook/chapter
  → Shows notification "Saved to Crapper Keeper ✓"
```

### Storage (chrome.storage.sync)
- `defaultNotebookId` — which notebook to save to
- `defaultSectionId` — which chapter within that notebook

---

## Firebase Sync
- Shares `davidthegnomadorg` project
- Same Firestore database
- Same Google Auth — `chrome.identity.getAuthToken` for silent auth
- Creates pages with: `{ userId, sectionId, title, contentJson, contentPlain, url, favicon, createdAt }`

---

## Build Steps
1. Create manifest.json with permissions (contextMenus, storage, identity)
2. Create background.js with context menu handlers + Firestore save
3. Create popup for config
4. Generate icons
5. Load unpacked extension in Chrome
6. Test save from right-click menu
