# Crapper Keeper — Complete Build & Deployment Log

## Overview

**Crapper Keeper** is a OneNote clone built as a single-page webapp with Google Auth, deployed to Firebase Hosting under `davidthegnomadorg.web.app/crapper-keeper/`. It supports multiple users with per-user data isolation via Firestore.

- **Stack:** Vanilla JS + TipTap editor + Firestore + Firebase Auth + Firebase Hosting
- **Repo:** https://github.com/davidthegnomad/crapper-keeper
- **Live URL:** https://davidthegnomadorg.web.app/crapper-keeper/
- **Firebase Project:** `davidthegnomadorg`

---

## Phase 1: Planning

### 1.1 Research OneNote
- Studied Microsoft OneNote official docs, feature lists, navigation patterns
- Identified hierarchy: Notebook → Section Group → Section → Page → Subpage
- Mapped all features into 3 tiers (MVP, Core, Advanced)
- Researched OneNote Vertical Tabs layout (notebooks in sidebar top, sections below, pages below)

### 1.2 Write plan.md first
- Created `plan.md` with complete feature inventory, architecture diagram, database schema (ERD), directory structure, build order, and risk assessment
- Got reviews from two LLMs (Nemotron + GLM) before writing any code
- Incorporated corrections: Section Groups in Tier 1, content_json authoritative, FTS5 on content_plain, 4-zone layout, corrected build order

### 1.3 Key planning decisions
- HTMX + TipTap hybrid (HTMX for shell, TipTap for editor)
- SQLite with WAL mode for local dev
- content_json as single source of truth, content_html + content_plain always derived
- Trapper Keeper vertical staggered tabs for notebook selector
- Sections renamed to "Chapters" per user preference

---

## Phase 2: Local Build (FastAPI + HTMX + SQLite)

### 2.1 Project scaffold
```
Crapper Keeper/
├── app/
│   ├── main.py              # FastAPI factory + root route
│   ├── config.py             # SQLite PRAGMA config
│   ├── dependencies.py       # DB session with WAL
│   ├── models/               # 9 SQLAlchemy models
│   ├── schemas/
│   ├── routers/              # notebooks, sections, pages, search, upload
│   ├── services/
│   ├── templates/            # Jinja2 base + components
│   ├── static/
│   │   ├── css/app.css       # Complete design system
│   │   └── js/               # editor.js, autosave.js, drag-drop.js
│   └── utils/                # prose_mirror.py, file_storage.py, htmx.py
├── alembic/                  # Migrations with FTS5 triggers
├── data/                     # SQLite DB (gitignored)
├── plan.md
├── requirements.txt
├── seed.py
└── Makefile
```

### 2.2 Database (SQLite with WAL)
- 9 models: Notebook, SectionGroup, Section, Page, Container, TagDefinition, TagInstance, FileUpload, Redirect
- FTS5 virtual table on `pages.content_plain` with sync triggers
- PRAGMA journal_mode=WAL mandatory at every connection
- content_json authoritative, content_html + content_plain derived on save

### 2.3 Editor (TipTap via CDN importmap)
- No build step — TipTap loads from esm.sh via `<script type="importmap">`
- Extensions: StarterKit, Underline, Link, Image, Highlight, TextAlign, Table, TaskList
- Auto-save: 1.5s debounce, save-on-blur, beforeunload, undo-compatible
- HTMX navigation guard: htmx:beforeSwap forces save before navigation

### 2.4 Design System (CSS)
- Complete app.css with design tokens (CSS custom properties)
- OneNote-inspired purple theme (#80397b)
- Trapper Keeper vertical staggered tabs on the left edge
- Dark mode via `html.dark` class
- Key rule: NO inline `<style>` blocks — everything in app.css

### 2.5 Local deployment (launchd)
- Created launchd plist at `~/Library/LaunchAgents/com.crapperkeeper.app.plist`
- Auto-starts on login, survives reboots, restarts on crash
- `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.crapperkeeper.app.plist`

---

## Phase 3: Firebase Migration

### 3.1 What changed
| Local (FastAPI) | Firebase |
|-----------------|----------|
| Python FastAPI routes | Firestore JS SDK direct queries |
| Jinja2 server-rendered templates | Client-side JS rendering (app.js) |
| SQLite + FTS5 | Firestore with composite indexes |
| File upload to local disk | Firebase Storage |
| No auth | Google Auth via Firebase Auth |
| Launchd service | Firebase Hosting (auto-CDN, SSL) |

### 3.2 Firebase setup
```bash
# Install Node.js
curl -sL https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-arm64.tar.gz | tar xz
ln -sf /tmp/node-v22.14.0-darwin-arm64/bin/node ~/.local/bin/node

# Install Firebase CLI
npm install -g firebase-tools

# Create project
firebase projects:create crapper-keeper-app --display-name "Crapper Keeper"
firebase apps:create WEB "Crapper Keeper" --project davidthegnomadorg
```

### 3.3 File structure for Firebase
```
public/
├── index.html           # SPA shell with auth overlay + app shell
├── css/app.css          # Same design system (copied)
└── js/
    ├── firebase-db.js   # Firestore CRUD + auth (replaces 8 Python files)
    ├── app.js           # Client-side rendering (replaces all Jinja2)
    ├── editor.js        # TipTap init (same, with Firestore save bridge)
    ├── autosave.js      # Same debounce logic
    └── drag-drop.js     # Same SortableJS integration
firebase.json            # Hosting config (public: deploy-dn)
firestore.rules          # Per-user security rules
firestore.indexes.json   # Composite indexes for queries
.firebaserc              # Project alias
```

### 3.4 Per-user data isolation
Every document includes `userId` field. Security rules enforce:
```javascript
allow read, write: if request.auth != null
    && request.auth.uid == resource.data.userId;
```

Composite indexes for filtered queries: userId + notebookId + position, etc.

### 3.5 Deployment commands
```bash
# Deploy to davidthegnomadorg subdirectory
firebase deploy --only hosting,firestore --project davidthegnomadorg --config firebase-dn.json

# Deploy Firestore rules only
firebase deploy --only firestore --project davidthegnomadorg

# Deploy indexes only
firebase deploy --only firestore:indexes --project davidthegnomadorg
```

---

## Phase 4: Google Auth

### 4.1 Setup steps
1. Firebase Console → Authentication → Sign-in method → Google → Enable
2. Firebase Console → Authentication → Settings → Authorized domains → Add `davidthegnomadorg.web.app`
3. Add Firebase Auth SDK imports to firebase-db.js
4. Add sign-in overlay to index.html
5. Wire up `signInWithPopup` with error handling in app.js
6. Update Firestore rules to require `request.auth != null`

### 4.2 Auth flow
```
User visits site → Auth overlay shown
  → Clicks "Sign in with Google"
  → Google popup appears
  → User authenticates
  → onAuthStateChanged fires with user object
  → Auth overlay hides, app shell shows
  → seedIfEmpty() creates initial notebooks if first login
  → refreshAll() loads user's data from Firestore
```

---

## Common Pitfalls & Lessons Learned

1. **Plan first, review twice** — Two LLM reviews caught structural errors (Section Groups in wrong tier, 3-pane vs 4-zone, FTS5 column index) that would have cost days to fix later.

2. **CSS in a `<style>` block looks like Windows 3.1** — Complete stylesheet in app.css with design tokens. No inline styles except dynamic DB values.

3. **Firebase API key is public** — It's a browser key, embeddable in client code. The Firebase CLI always masks it; get it from Firebase Console → Project Settings → General.

4. **Firestore needs composite indexes** — Any query with multiple `where()` + `orderBy()` clauses needs a composite index. Deploy via `firestore.indexes.json` with `firebase deploy --only firestore:indexes`. They take ~2 minutes to build.

5. **Google Auth popup fails silently** — Wrap `signInWithPopup` in try/catch with `alert()`. Common causes: provider not enabled, domain not authorized, popup blocked.

6. **`onAuthStateChanged` fires once on load** — If user is already signed into another app on the same Firebase project, the overlay is hidden immediately. Use incognito to test the sign-in flow.

7. **Deploy to subdirectory**: Use `/crapper-keeper/` as the public folder name and absolute paths (`/crapper-keeper/js/...`) in HTML.

8. **Trailing slash redirect drops query params** — Register both `@router.get("")` and `@router.get("/")` in FastAPI search routes.

9. **FTS5 `snippet()` column index is 0-based** — `snippet(fts_table, 1, ...)` targets the second column.

10. **`.hidden` CSS class** — Hyperscript `toggle .hidden` requires `.hidden{display:none!important}` in CSS.

11. **Python 3.9** — `dict | str` union types need `from __future__ import annotations`.

12. **Launchd > nohup** — For persistent local server, use launchd (macOS) or systemd (Linux). Never background with `&`.

13. **Circular imports** — Put root route directly in `main.py`, not a separate router file.

14. **Emoji vs text in toolbar** — Emoji rendering varies across platforms. Prefer text characters for buttons.

15. **Firebase deploy --config flag** — Use a separate `firebase-dn.json` when deploying to a subdirectory of a different project to avoid overwriting the main site.

---

## Useful Commands

```bash
# Local dev
cd "/Users/gnomadstudio/Desktop/AI Project Folder/ORGANIZATION/05_apps_and_extensions/Crapper Keeper"
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# Deploy to Firebase
firebase deploy --only hosting,firestore --project davidthegnomadorg --config firebase-dn.json

# Deploy indexes only
firebase deploy --only firestore:indexes --project davidthegnomadorg

# Check deployed files
curl -s "https://davidthegnomadorg.web.app/crapper-keeper/" | head -20
```

---

## Phase 5: Chrome Extension

Right-click any webpage to save it to Crapper Keeper. See `extension/README.md` for full docs.

### Extension files
```
extension/
├── manifest.json      # Chrome MV3 — contextMenus + storage
├── background.js      # Service worker: 4 right-click menu items, Firestore save
├── popup.html         # Settings: pick default notebook + chapter
├── popup.js           # Loads notebook list from Firestore
├── icons/             # Purple CK icons (16, 48, 128px)
├── plan.md            # Extension design doc
└── README.md          # Install + usage instructions
```

### Install
1. `chrome://extensions` → Developer mode ON → Load unpacked → select `extension/`
2. Sign into the [webapp](https://davidthegnomadorg.web.app/crapper-keeper/) first
3. Right-click any page → "Save to Crapper Keeper"

### Auth
Shares the same Firebase project and Google Auth. If signed into the webapp, the extension picks up your session automatically.
