# Crapper Keeper — OneNote Clone (HTMX Web App)

## Overview
A browser-based digital notebook that mirrors the core organization and editing experience of Microsoft OneNote. Built with **FastAPI + HTMX + SQLite + TipTap (rich text)** — a server-rendered MPA that feels as fluid as OneNote while keeping JS to where it's actually needed (the rich text editor).

> **Post-review (Nemotron + GLM):** This plan incorporates critiques from both models. The most significant changes from the initial draft: 4-zone layout instead of 3-pane, Section Groups promoted to Tier 1, free-form canvas deferred past MVP, `content_json` made authoritative with `content_plain` for FTS, tags split into definitions/instances, and a corrected 9-phase build order.

---

## 1. Feature Inventory (OneNote Feature Audit)

### Tier 1 — MVP (Ship First)

| # | Feature | Description |
|---|---------|-------------|
| 1.1 | **Notebook CRUD** | Create, rename, delete notebooks. Dropdown/tab bar at top. |
| 1.2 | **Section CRUD** | Sections within a notebook — create, with optional Section Group membership, rename, reorder, delete. Color picker per section. |
| 1.3 | **Section Groups** | Folder-like groups that hold multiple sections. Create, rename, delete within a notebook. Nestable. Collapsible in the section pane. Present from Day 1 so users never create 50 flat sections. |
| 1.4 | **Page CRUD** | Pages within a section — create, rename, reorder, delete. |
| 1.5 | **Subpage Hierarchy** | Indent a page beneath another to make it a subpage. Collapse/expand parent in page list. Subpages ordered within parent scope. |
| 1.6 | **Rich Text Editor** | Bold, italic, underline, strikethrough, heading levels (H1–H6), bullet list, numbered list, indent/outdent, text color, highlight. **Linear mode only** (single editor instance, behaves like a normal document). |
| 1.7 | **Four-Zone Layout** | Top bar (notebook selector), left pane (section tab strip with Section Group folders), middle pane (page list with subpage indentation), right pane (editor canvas). Resizable dividers between content panes. Left pane collapsible. |
| 1.8 | **Section Colors** | Color-coded section tabs (OneNote style). Color shows in section tab and as accent line on page title. |
| 1.9 | **Drag-and-Drop Reorder** | Drag pages to reorder within a section, or move between sections. Drag sections to reorder. |
| 1.10 | **Auto-Save** | Debounced auto-save (1.5s after last keystroke). Save on blur and beforeunload. Visual indicator ("Saving..." / "Saved" / "Unsaved"). |
| 1.11 | **Full-Text Search** | Search across all notebooks, sections, and pages via SQLite FTS5 on `content_plain` (plain text, not HTML). Results show path + highlighted snippet. |
| 1.12 | **Images** | Insert images into a page (upload or paste from clipboard). Stored on filesystem with content-addressed (hash) paths. Display inline. |
| 1.13 | **Hyperlinks** | Insert external links in rich text. Internal page links use standard URL paths (`/pages/{id}`) with `redirects` table for moved pages. |
| 1.14 | **Undo/Redo (Rich Text)** | History stack within the editor (TipTap history extension). Auto-save resets dirty flag so undo works correctly past save boundaries. |

### Tier 2 — Core Experience (v1.1)

| # | Feature | Description |
|---|---------|-------------|
| 2.1 | **Tags System** | Multi-dimensional tags: To-Do (checkbox with checked/unchecked state), Important (star), Question, Remember for Later, Definition, Priority (1-3), custom tags with user-defined icons. Backed by `tag_definitions` + `tag_instances` tables with JSON state. Tag summary page. |
| 2.2 | **Tables** | Insert/edit tables with variable rows/columns. Resize columns. Add/delete rows. Merge cells (simple mode). |
| 2.3 | **Free-Form Canvas** | Opt-in mode (`page_mode: 'freeform'`). Double-click anywhere to place a positionable text container. Containers auto-expand (nullable width/height = auto-size). Drag by handle bar to reposition. Linear ↔ freeform mode switching with data-loss warning. |
| 2.4 | **File Attachments** | Drag files onto a page to attach them. Display as icon + filename. Click to download. Stored in `uploads/attachments/` with `file_uploads` table. |
| 2.5 | **Audio Recording** | Record audio in-browser via MediaRecorder API. Attach to page with playback widget. |
| 2.6 | **Page Templates** | Pre-built page templates (blank, meeting notes, to-do list, weekly planner). Applied on page creation. |
| 2.7 | **Export** | Export single page or entire notebook as Markdown, HTML, or PDF (via print). |

### Tier 3 — Advanced (v1.2+)

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | **Drawing / Ink** | Canvas overlay mode for freehand drawing with mouse/pen. Pen color + thickness. Highlighter tool. Eraser. |
| 3.2 | **OCR from Images** | Extract text from inserted images (via Tesseract.js or server-side OCR). Make image text searchable. |
| 3.3 | **Handwriting Recognition** | Convert ink strokes to typed text (server-side with ML or via MyScript Web API). |
| 3.4 | **Spell Check** | Browser-native spellcheck or optional integration (e.g., Typo.js or LanguageTool API). |
| 3.5 | **Version History** | Snapshot page content on save. View/restore previous versions from a timeline. |
| 3.6 | **Linked Notes** | When viewing a page while working in another app, automatically link to that context. |
| 3.7 | **Collaboration** | Real-time co-authoring via WebSockets. Share notebooks with read/write permissions. |
| 3.8 | **Offline Support** | Service Worker caching. IndexedDB fallback for editing without internet. Sync on reconnect. |
| 3.9 | **Math Equations** | LaTeX equation editor (KaTeX rendering). Inline and display math. |

---

## 2. Architecture

### 2.1 Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Backend** | Python + FastAPI | Async, auto-docs, HTMX-native with Jinja2, excellent perf |
| **Database** | SQLite with WAL mode | Zero-setup for local dev. WAL prevents auto-save from blocking navigation reads. PostgreSQL swap only if multi-user needed. |
| **ORM** | SQLAlchemy 2.0 + Alembic | Migrations, relationship loading, async via `run_in_executor` (not `aiosqlite` — SQLite serialization is the bottleneck, not GIL) |
| **Templates** | Jinja2 | Standard for FastAPI/HTMX. Server-rendered partials for HTMX swaps |
| **Rich Text Editor** | TipTap v2 (ProseMirror) | Industry standard. Extensible, clean JSON output, works with HTMX as embedded widget |
| **Free-Form Canvas** | Custom JS (absolutely positioned containers) | TipTap instances inside draggable containers. Container model with nullable width/height for auto-expand. Deferred to Tier 2. |
| **CSS** | Tailwind CSS v4 | Utility-first, rapid prototyping, small output with purging |
| **Icons** | lucide-static (pre-compiled SVG sprites) | Zero runtime JS cost vs lucide npm package |
| **Drag & Drop** | SortableJS | Lightweight, touch-friendly, HTMX-compatible via events |
| **File Storage** | Local filesystem with content-addressed (hash) paths | Deduplication, easy backup, CDN-migratable. Path: `uploads/images/{hash[:2]}/{hash[2:4]}/{hash}` |
| **Search** | SQLite FTS5 on `content_plain` | Plain text avoids HTML tag pollution in tokenization. Fast, zero extra infra. |
| **Auth** | None (local-first) | Zero value for single-user self-hosted. Add only if multi-user or internet-exposed. |

### 2.2 High-Level Data Flow

```
Browser                        Server
  │                               │
  ├── Initial page load ─────────►├── FastAPI route
  │                               │   ├── Query DB (SQLAlchemy + WAL)
  │                               │   ├── Render FULL page (all 4 zones in 1 response)
  │◄── Full HTML page ────────────┤   └── Returns pre-rendered tags + status
  │                               │
  ├── Switch section ────────────►├── GET /sections/{id}?render=pages+first_page
  │    (HTMX hx-get)              │   ├── Query pages in section + first page content
  │◄── Two partials (page list    │   └── Return [page_list.html, page_editor.html]
  │    + editor) in one response──┤
  │                               │
  ├── Type in TipTap ────────────►├── POST /pages/{id}/save
  │    (1.5s debounce, sends      │   ├── Derive content_html + content_plain
  │     content_json only)        │   ├── Atomic DB write (all 3 fields + FTS)
  │◄── HTMX updates save status──┤   └── Reset dirty flag on success
  │                               │
  ├── Drag page to reorder ──────►├── POST /pages/{id}/move
  │    (SortableJS onEnd event)   │   ├── Update position + section_id + tree_path
  │◄── HTMX swaps page list ──────┤   └── Return updated page list fragment
```

### 2.3 Page Content Storage Strategy

**Single source of truth rule: `content_json` is authoritative. `content_html` and `content_plain` are always derived on every save.**

```
Write path:   TipTap → content_json → POST → server derives content_html + content_plain
                                          → atomic UPDATE: content_json, content_html, content_plain
                                          → FTS5 trigger re-indexes on content_plain update

Read path (editor):     Server returns content_json → TipTap rehydrates
Read path (search):     FTS5 queries content_plain → results render from content_html with highlights
Read path (display):    Server returns content_html for non-editor views (tag summary, search results)
```

**Never write `content_html` or `content_plain` directly.** If a future feature needs server-side content manipulation, it operates on `content_json` via ProseMirror's programmatic API and regenerates the derived fields.

### 2.4 Layout — Vertical Tabs (OneNote Modern)

OneNote's modern **Vertical Tabs** layout uses a single scrollable left sidebar with three stacked regions: notebooks (top), sections (middle), pages (bottom). This is the default and recommended layout — matches OneNote for Windows, Mac, and Web.

```
┌───────────────────────────────────────────────────────────┐
│  ☰  Crapper Keeper           🔍 [Search...]    [⚙]  [◻] │  ← Thin title bar
├──────────────┬────────────────────────────────────────────┤
│ 📓 My Notes  │┌────────────────────────────────────────┐  │
│ 📗 Work      ││  ○ Section A  ○ Section B◉ ○ Section C│  │
│ 📘 Personal  │├────────────────────────────────────────┤  │
│ [≡ collapse] ││  📄 Page 1                            │  │
│───────────── ││  📄 Page 2                            │  │
│ ○ Section A  ││    ↳ Subpage 2a                      │  │
│ ○ Section B◉ ││  📄 Page 3                            │  │
│ ○ Section C  ││                                       │  │
│ 📁 Work Group││  ┌────────────────────────────────┐   │  │
│ ├─ Section D ││  │ Bold  Italic  U  H1  H2  ⋯   │  │  │
│ └─ Section E ││  │                                │  │  │
│───────────── ││  │ Click and type...             │  │  │
│ 📄 Page 1    ││  │                                │  │  │
│ 📄 Page 2    ││  └────────────────────────────────┘   │  │
│   ↳ Sub 2a  ││                                        │  │
│ 📄 Page 3    │└────────────────────────────────────────┘  │
│              │                                             │
├──────────────┴────────────────────────────────────────────┤
│  📶 Connected  ·  Saved  ·  My Notes > Section B > Page 2│  ← Status bar
└───────────────────────────────────────────────────────────┘
```

**Zones (3, not 4):**
1. **Title bar** (thin, top) — Hamburger menu (≡), app name, search bar, settings gear, dark mode toggle
2. **Left sidebar** (single scrollable column) — Three stacked sections:
   - **Notebook list** (top) — Collapsible to icons via ≡ button. Active notebook highlighted.
   - **Section tabs** (middle) — Vertical list with color bars on left edge. Section Group folders (📁) expandable inline.
   - **Page list** (bottom) — With subpage indentation (↳). Collapse/expand parents.
3. **Editor canvas** (right) — TipTap editor with floating toolbar. Everything to the right of the sidebar.

**Why 3 zones instead of 4:** OneNote's Vertical Tabs puts notebooks, sections, and pages in a single scrollable sidebar column. This avoids the plan's earlier incorrect "notebook tabs across the top bar" approach. A single sidebar works because:
- Notebooks are few (typically 3–8 open at once)
- The notebook list is collapsible (≡ button) when you need more space for sections/pages
- Section Groups provide hierarchy without needing a separate zone

**Notebook list collapse behavior:** Click the ≡ (three-vertical-lines) button at the top of the notebook list to collapse it to narrow icon-only mode. Click again to expand. This is directly from OneNote's behavior.

### 2.5 Navigation Flow

1. **App loads** → redirects to `/{notebook_id}/{section_id}/{page_id}` — full page pre-rendered server-side (sidebar + editor in one response)
2. **Switch notebook** → click notebook name in left sidebar → left sidebar content swaps entirely (new sections + first section's pages + first page loaded in editor). URL updates to `/{new_notebook_id}/{first_section_id}/{first_page_id}`.
3. **Switch section** → click section in left sidebar → bottom half of sidebar (page list) swaps + editor loads first page. URL updates to `/{notebook_id}/{section_id}/{first_page_id}`.
4. **Click page** → click page in left sidebar → right pane loads page content. URL updates to `/{notebook_id}/{section_id}/{page_id}`.
5. **Breadcrumb** in status bar: Notebook > Section > Page (clickable each level)

### 2.6 HTMX Strategy

| Pattern | Usage |
|---------|-------|
| **hx-get** | Load page content on page click, search results, section change (with batch rendering) |
| **hx-post** | Create notebook/section/page, save page content, move items, toggle tags |
| **hx-put** | Rename notebook/section/page |
| **hx-delete** | Delete notebook/section/page |
| **hx-trigger** | `click`, `dblclick`, `revealed` (infinite scroll), `every 30s` (ping save status), `load` (lazy status bar) |
| **hx-target** | Swap into the relevant pane or modal |
| **hx-swap** | `innerHTML` (typical), `outerHTML` (for list items), `beforeend` (append new page) |
| **hx-push-url** | Update browser URL for deep-linkable pages |
| **hx-boost** | Optional: boost full nav links for smooth transitions |

**Key optimization:** When a section switch triggers both a page list swap AND an editor content swap, send both partials in a single HTTP response using HTMX's multi-swap extension (`HX-Trigger-After-Swap` + multiple targets) or compose them as a single response with named targets.

---

## 3. Database Schema

### 3.1 Complete Schema

```sql
-- PRAGMA configuration (set at connection startup, NOT optional)
PRAGMA journal_mode=WAL;           -- Write-Ahead Log: concurrent reads during writes
PRAGMA synchronous=NORMAL;         -- Safe with WAL, ~50x faster than FULL
PRAGMA busy_timeout=5000;          -- 5s wait before SQLITE_BUSY error
PRAGMA foreign_keys=ON;            -- Required: the schema uses FK constraints
PRAGMA cache_size=-64000;          -- 64MB page cache
PRAGMA mmap_size=268435456;        -- 256MB memory-mapped I/O


┌─────────────────┐       ┌───────────────────────┐
│    notebooks     │       │   section_groups       │
│─────────────────│       │───────────────────────│
│ id (PK)         │──┐    │ id (PK)                │
│ title           │  │    │ notebook_id (FK) ──────┤
│ created_at      │  │    │ parent_id (self-FK)    │── for nested groups
│ updated_at      │  │    │ title                  │
│ position (int)  │  │    │ position (int)         │
└─────────────────┘  │    │ created_at             │
                      │    └───────────────────────┘
         ┌────────────┤
         │            │
┌────────┴───────┐    │    ┌───────────────────────────────────────┐
│   sections      │    │    │     pages                             │
│────────────────│    │    │───────────────────────────────────────│
│ id (PK)        │────┘    │ id (PK)                                │
│ notebook_id(FK)│         │ section_id (FK) ──────────────────────┤
│ section_group  │         │ parent_page_id (FK, self-ref) ────────┤── subpages
│   _id (FK, nul)│         │ title                                  │
│ title          │         │ content_json TEXT NOT NULL DEFAULT '{}'│── AUTHORITATIVE
│ color TEXT     │         │ content_html TEXT NOT NULL DEFAULT ''  │── derived from JSON
│ position (int) │         │ content_plain TEXT NOT NULL DEFAULT '' │── plain text for FTS
│ created_at     │         │ page_mode TEXT DEFAULT 'linear'        │── 'linear' | 'freeform'
│ updated_at     │         │ tree_path TEXT                         │── e.g. "0001/0002/0003"
│                │         │ position INTEGER NOT NULL DEFAULT 0    │── scoped to parent
└────────────────┘         │ is_collapsed BOOLEAN DEFAULT FALSE     │── user pref per session
                            │ created_at                             │
                            │ updated_at                             │
                            └───────────┬───────────────────────────┘
                                        │
               ┌────────────────────────┼────────────────────────────┐
               │                        │                            │
    ┌──────────┴──────────┐  ┌──────────┴──────────┐  ┌─────────────┴──────────────┐
    │    tag_definitions    │  │    tag_instances     │  │     containers (Tier 2)     │
    │──────────────────────│  │─────────────────────│  │────────────────────────────│
    │ id (PK)              │  │ id (PK)              │  │ id (PK)                    │
    │ notebook_id (FK) ────┤  │ tag_definition_id ───┤  │ page_id (FK) ──────────────┤
    │ name TEXT            │  │   (FK)               │  │ content_json TEXT          │
    │ tag_type TEXT        │  │ page_id (FK) ────────┤  │ content_html TEXT          │
    │ icon TEXT            │  │ container_id (nul)   │  │ x FLOAT DEFAULT 0.0        │
    │ color TEXT           │  │ paragraph_id TEXT    │  │ y FLOAT DEFAULT 0.0        │
    │ has_state BOOL       │  │ state JSON           │  │ width FLOAT (nullable)     │── NULL=auto
    │ state_schema TEXT    │  │ created_at           │  │ height FLOAT (nullable)    │── NULL=auto
    │ is_custom BOOL       │  └──────────────────────┘  │ z_index INT DEFAULT 0      │
    │ created_at           │                           │ created_at                  │
    └──────────────────────┘                           └─────────────────────────────┘

    ┌───────────────────────┐
    │    file_uploads        │
    │───────────────────────│
    │ id (PK)               │
    │ page_id (FK) ─────────┤
    │ filename TEXT          │── original name
    │ storage_path TEXT UNIQ │── hash-based path
    │ mime_type TEXT         │
    │ file_size INTEGER      │
    │ width INTEGER          │── for images
    │ height INTEGER         │── for images
    │ thumbnail_path TEXT    │── server-generated thumbnail
    │ created_at             │
    └───────────────────────┘

    ┌───────────────────────┐
    │    redirects            │
    │───────────────────────│
    │ id (PK)               │
    │ old_page_id INT UNIQUE│── the page that was at this ID
    │ new_page_id INT (FK)  │── where it moved to
    │ created_at             │
    └───────────────────────┘
```

### 3.2 FTS5 Virtual Table

```sql
-- Indexes plain text, not HTML — HTML tags pollute FTS5 tokenization
CREATE VIRTUAL TABLE pages_fts USING fts5(
    title, content_plain,
    content='pages', content_rowid='id'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER pages_ai AFTER INSERT ON pages BEGIN
    INSERT INTO pages_fts(rowid, title, content_plain)
    VALUES (new.id, new.title, new.content_plain);
END;

CREATE TRIGGER pages_ad AFTER DELETE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
    VALUES ('delete', old.id, old.title, old.content_plain);
END;

CREATE TRIGGER pages_au AFTER UPDATE ON pages BEGIN
    INSERT INTO pages_fts(pages_fts, rowid, title, content_plain)
    VALUES ('delete', old.id, old.title, old.content_plain);
    INSERT INTO pages_fts(rowid, title, content_plain)
    VALUES (new.id, new.title, new.content_plain);
END;
```

### 3.3 Key Schema Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Authoritative source** | `content_json` | `content_html` and `content_plain` are derived on every save. Never written directly. |
| **FTS target** | `content_plain` (not `content_html`) | HTML tags (<strong>, <em>) become noise tokens in FTS5. Plain text gives clean search. |
| **Container width/height** | Nullable | NULL = auto-size (measure content on render). Non-NULL = user-resized. Matches OneNote behavior. |
| **Page position scoping** | Scoped to parent | When `parent_page_id IS NULL`: position within section. When NOT NULL: position within parent. |
| **tree_path** | Materialized path string | Enables `ORDER BY tree_path` for correct tree ordering without recursive CTEs. Format: zero-padded 4-digit segments per level, e.g. `"0001/0002/0003"`. |
| **Tags** | definitions + instances | Supports multi-dimensional tags (To-Do with state, Priority with value, custom tags with icons). JSON `state` column for arbitrary tag state. |
| **File uploads** | Content-addressed filesystem paths | Path: `uploads/images/{hash[:2]}/{hash[2:4]}/{full_hash}{ext}`. Deduplication, no BLOBs in SQLite. |
| **Redirects** | Separate table | When a page moves, old path redirects to new path. Graceful internal link resolution. |
| **WAL mode** | Mandatory at connection startup | Without it, auto-save writes block navigation reads. Non-negotiable. |

---

## 4. Directory Structure

```
Crapper Keeper/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI app factory, lifespan, middleware, PRAGMA init
│   ├── config.py               # Settings (DB path, upload dir, WAL config, etc.)
│   ├── dependencies.py         # Shared dependencies (get_db — uses run_in_executor, not aiosqlite)
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── notebook.py         # Notebook SQLAlchemy model
│   │   ├── section_group.py    # SectionGroup model
│   │   ├── section.py          # Section model
│   │   ├── page.py             # Page model
│   │   ├── container.py        # Container model (Tier 2)
│   │   ├── tag.py              # TagDefinition + TagInstance models
│   │   ├── file_upload.py      # FileUpload model
│   │   └── mixins.py           # Common mixins (TimestampMixin, PositionedMixin)
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── notebook.py         # Pydantic request/response models
│   │   ├── section.py
│   │   ├── page.py
│   │   └── common.py           # Shared types, enums (PageMode, TagType, etc.)
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── notebook.py         # /notebooks endpoints + HTMX partials
│   │   ├── section.py          # /sections endpoints
│   │   ├── page.py             # /pages endpoints
│   │   ├── search.py           # /search endpoint
│   │   ├── tags.py             # /tags endpoints
│   │   └── upload.py           # /upload (images, attachments, audio)
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── notebook.py         # Business logic
│   │   ├── section.py
│   │   ├── page.py             # Contains content_json → content_html + content_plain derivation
│   │   ├── search.py
│   │   └── fts.py              # FTS5 trigger management + reindex
│   │
│   ├── templates/
│   │   ├── base.html           # Base layout (4-zone skeleton)
│   │   ├── components/
│   │   │   ├── notebook_bar.html       # Top bar: notebook selector + search
│   │   │   ├── section_pane.html       # Left pane: section tabs + section groups
│   │   │   ├── page_list.html          # Middle pane: page list with subpage tree
│   │   │   ├── page_editor.html        # Right pane: editor canvas
│   │   │   ├── search_results.html     # Search results panel (replaces middle pane)
│   │   │   ├── tag_summary.html        # Tag collection page
│   │   │   ├── modal.html              # Reusable modal overlay
│   │   │   └── context_menu.html       # Right-click context menu
│   │   └── partials/
│   │       ├── page_row.html           # Single page list item (for reorder)
│   │       ├── section_tab.html        # Single section tab
│   │       ├── notebook_item.html      # Single notebook in top bar
│   │       └── toast.html              # Notification toast
│   │
│   ├── static/
│   │   ├── css/
│   │   │   ├── app.css                # Tailwind output + custom styles
│   │   │   └── editor.css             # TipTap-specific overrides
│   │   ├── js/
│   │   │   ├── editor.js              # TipTap initialization + plugins
│   │   │   ├── canvas.js              # Free-form container management (Tier 2)
│   │   │   ├── drag-drop.js           # SortableJS integration
│   │   │   ├── autosave.js            # Debounced save + beforeunload handler
│   │   │   ├── htmx-bridge.js         # htmx:beforeSwap handler (final save before nav)
│   │   │   └── search.js              # Search with debounce + hotkey
│   │   └── img/
│   │       └── logo.svg
│   │
│   └── utils/
│       ├── __init__.py
│       ├── htmx.py             # HTMX response helpers
│       ├── file_storage.py     # Content-addressed file save/retrieve
│       └── prose_mirror.py     # JSON ↔ HTML ↔ plain text conversion
│
├── uploads/
│   ├── images/                 # Hash-based subdirectories (ab/cd/abcdef123.jpg)
│   ├── attachments/
│   └── audio/
│
├── alembic/
│   └── versions/
├── alembic.ini
│
├── tests/
│   ├── conftest.py
│   ├── test_schemas.py         # Data integrity tests (FTS sync, content derivation)
│   ├── test_notebooks.py
│   ├── test_sections.py
│   ├── test_pages.py
│   └── test_search.py
│
├── seed.py                    # Development seed data
├── requirements.txt
├── Makefile                   # dev, migrate, seed shortcuts
├── tailwind.config.js
├── package.json
└── plan.md                    # ← This file
```

---

## 5. UI / Layout Design

### 5.1 Vertical Tabs Layout

```
┌───────────────────────────────────────────────────────────┐
│  ☰  Crapper Keeper           🔍 [Search...]    [⚙]  [◻] │  ← Thin title bar
├──────────────┬────────────────────────────────────────────┤
│ 📓 My Notes  │┌────────────────────────────────────────┐  │
│ 📗 Work      ││  ○ Section A  ○ Section B◉ ○ Section C│  │
│ 📘 Personal  │├────────────────────────────────────────┤  │
│ [≡ collapse] ││  📄 Page 1                            │  │
│───────────── ││  📄 Page 2                            │  │
│ ○ Section A  ││    ↳ Subpage 2a                      │  │
│ ○ Section B◉ ││  📄 Page 3                            │  │
│ ○ Section C  ││                                       │  │
│ 📁 Work Group││  ┌────────────────────────────────┐   │  │
│ ├─ Section D ││  │ Bold  Italic  U  H1  H2  ⋯   │  │  │
│ └─ Section E ││  │                                │  │  │
│───────────── ││  │ Click and type...             │  │  │
│ 📄 Page 1    ││  │                                │  │  │
│ 📄 Page 2    ││  └────────────────────────────────┘   │  │
│   ↳ Sub 2a  ││                                        │  │
│ 📄 Page 3    │└────────────────────────────────────────┘  │
│              │                                             │
├──────────────┴────────────────────────────────────────────┤
│  📶 Connected  ·  Saved  ·  My Notes > Section B > Page 2│  ← Status bar
└───────────────────────────────────────────────────────────┘
```

**The left sidebar** is a single scrollable column divided into three regions:
- **Top region** — Notebook list. Active notebook has a distinct background/highlight. Collapse via ≡ button shrinks to icon-only strip.
- **Middle region** — Section tabs with vertical color bars on the left edge. Section Groups shown as expandable folders (📁). Active section has ◉ indicator.
- **Bottom region** — Page list with subpage indentation (↳). Collapse/expand parents via ▶/▼.

**Resizable divider** between the sidebar and the editor canvas. The entire sidebar can be collapsed via the ☰ hamburger in the title bar.

### 5.2 OneNote Feature Mapping

| OneNote UI Element | Crapper Keeper Implementation |
|--------------------|-------------------------------|
| Notebook list (sidebar top, collapsible) | Left sidebar top region: notebook names. Active notebook highlighted. ≡ button collapses to icons. |
| Notebook dropdown (horizontal tabs mode) | Optional alt layout. Notebook selector dropdown in top app bar area. |
| Section tab strip | Left sidebar middle region: vertical tabs with color bar on left edge |
| Section Groups | Left sidebar: collapsible 📁 folders containing sections |
| Page list | Left sidebar bottom: page list with subpage indentation (↳), collapse/expand parents |
| Page canvas (main area) | Right pane: TipTap editor (linear MVP) or positioned containers (freeform Tier 2) |
| Status bar (bottom) | Status bar: save indicator, connection status, breadcrumb, section color accent |
| Search (top right) | Search bar in title bar, opens results overlay or replaces page list temporarily |
| Three-vertical-lines collapse | ≡ button at top of notebook list — collapses to narrow icon strip |
| Navigation button (≡ hamburger) | ☰ button in title bar — collapses entire left sidebar |

### 5.3 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New page in current section |
| `Ctrl+Shift+N` | New section |
| `Ctrl+E` | Focus search |
| `Ctrl+S` | Force save |
| `Ctrl+B` | Bold (TipTap built-in) |
| `Ctrl+I` | Italic |
| `Ctrl+U` | Underline |
| `Alt+Shift+D` | Toggle dark mode |
| `Escape` | Close modals / blur editor |

---

## 6. Key Implementation Decisions

### 6.1 Why HTMX + TipTap Instead of a Full SPA

- **HTMX** handles all server interactions (CRUD, navigation, search, reorder) — no JS framework needed for the app shell
- **TipTap** handles the rich text editor because HTMX alone cannot provide a WYSIWYG editing experience; the editor is an "escape hatch" JS widget embedded inside an otherwise HTMX-driven page
- This hybrid gives us OneNote's rich editing without committing to React/Vue/Svelte for the entire app
- **Alpine.js** or **Hyperscript** for glue: toggle modals, handle drag events, show/hide panels — lightweight, no build step
- **Honest dependency accounting:** The app ships ~60KB gzipped JS (TipTap + extensions + SortableJS). This is comparable to a lightweight framework. The HTMX shell handles navigation and CRUD without JS, but the rich text editor inherently requires a JS library.

### 6.2 Content Storage: Authoritative Source

**Rule: `content_json` is authoritative. `content_html` and `content_plain` are always derived on every save.**

```python
# Service layer — single write path
def save_page(page_id: int, content_json: dict) -> Page:
    from app.utils.prose_mirror import json_to_html, html_to_plain_text

    content_html = json_to_html(content_json)
    content_plain = html_to_plain_text(content_html)

    db.execute("""
        UPDATE pages
        SET content_json = ?, content_html = ?, content_plain = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, [json.dumps(content_json), content_html, content_plain, page_id])

    # FTS trigger fires automatically on content_plain update
```

- The editor **always** rehydrates from `content_json`
- Search results render from `content_html` with highlighted snippets
- FTS5 indexes `content_plain` only (no HTML tag pollution)
- If a future feature needs server-side content modification, it operates on `content_json` via ProseMirror's programmatic API and regenerates derivatives

### 6.3 Save Strategy

- **TipTap `onUpdate` callback** → debounce 1.5s → POST `/pages/{id}/save` with `content_json` only
- **Save-on-blur**: When the editor loses focus, immediately save (no debounce wait)
- **Save-on-beforeunload**: `window.addEventListener('beforeunload', forceSave)` catches tab-closes
- **HTMX navigation guard**: `htmx:beforeSwap` event handler forces a save before any HTMX-driven navigation:

```javascript
document.body.addEventListener('htmx:beforeSwap', function(evt) {
    if (currentEditor && currentEditor.isDirty) {
        evt.preventDefault();
        forceSave(pageId, currentEditor).then(() => {
            htmx.trigger('.page-editor', 'navigate-proceed');
        });
    }
});
```

- **Undo/redo compatibility**: After each successful auto-save, reset TipTap's dirty flag so `Ctrl+Z` can undo past a save point. The editor compares against the **last saved state**, not the initial load state:

```javascript
function onSaveSuccess(editor, savedJson) {
    // Reset dirty tracking so undo can reverse past save boundaries
    editor.currentContent = savedJson;
    editor.isDirty = false;
    updateStatusBar('Saved');
}
```

- **Visual indicator**: "Saving..." (yellow) → "Saved" (green, auto-dismisses after 2s) → "Unsaved changes" (red, stays until next success). On save failure: red indicator + retry after 5s.

### 6.4 Search Architecture

- **Index target**: SQLite FTS5 on `content_plain` column (plain text, not HTML)
- **Sync**: FTS triggers on INSERT/UPDATE/DELETE of `pages` table
- **Search route**: `GET /search?q=...` returns HTML fragment with results
- **Result format**: Notebook > Section > Page path, snippet from `content_html` with `<mark>` highlighting. Snippet offset mapping: find match position in `content_plain`, map back to corresponding position in `content_html` via character-offset tracking from the HTML-to-plain-text conversion step.
- **Click result** → navigate to page via URL path
- **Debounce**: Search fires 300ms after the user stops typing

### 6.5 Tags System

- **Two-table model**: `tag_definitions` (per-notebook type definitions) + `tag_instances` (per-paragraph occurrences with state)
- **Built-in tag types**: To-Do (checkbox with checked/unchecked), Important (star), Question, Remember for Later, Definition, Priority (1/2/3)
- **Custom tags**: Users can create tags with custom name, icon (Lucide icon name), color, and state schema (JSON)
- **Tag instance state**: Stored as JSON — `{"checked": true}` for To-Do, `{"priority": 1}` for Priority, `{}` for static tags
- **Tag selector**: Clicking in the editor toolbar opens a tag definition picker. Tapping an existing tag toggles its state (for To-Do) or opens context menu
- **Tag summary page**: `/tags/summary` collects all tagged items across all notebooks, grouped by tag type, filterable by notebook
- **To-Do checkbox**: Renders as `<input type="checkbox">` in HTML, toggles via `POST /tags/{id}/toggle`

### 6.6 Internal Links

- **Scheme**: Standard URL paths, not a custom `notebook://` scheme
- **Link format**: `/pages/{page_id}` for internal page links
- **Resolution**: Server looks up page by ID. If found, renders as a clickable `<a>` tag. If page was moved, checks `redirects` table and follows to new page.
- **Copy link to page**: Right-click page → "Copy Link" → copies full URL `https://host/notebooks/{id}/sections/{id}/pages/{id}`
- **URI scheme notice**: `notebook://` is not registered and won't work in browsers or native apps. Standard URL paths are universally clickable.

### 6.7 Free-Form Canvas (Tier 2 — deferred past MVP)

- **Linear mode** (default, ships in MVP): Single editor instance. All content flows vertically. Behaves like a normal document.
- **Freeform mode** (Tier 2): `page_mode` switches to `'freeform'`. Containers become absolutely positioned. Double-click on the canvas creates a new container.
- **Container auto-expand**: `width` and `height` columns on the `containers` table are nullable. When NULL, TipTap's `onUpdate` callback measures the rendered content and stores the computed dimensions. When the user manually resizes a container, set explicit values.
- **Mode switch**: Warn user about potential layout changes. On switch to freeform, auto-position existing containers in a grid pattern. On switch to linear, stack containers vertically by `(y, x)` order.
- **OneNote UX detail**: OneNote's "click anywhere" is actually **double-click** to create a new container. A single click selects existing containers. Implement this distinction.

### 6.8 Section Groups — Design for Them from Day 1

- Section Groups are **not optional** in OneNote's model. Any notebook can have flat sections OR grouped sections.
- The `sections` table has a nullable `section_group_id`. When NULL, the section appears at the top level. When set, it appears inside the group folder.
- Section Groups are collapsible in the left pane. When collapsed, their child sections are hidden.
- Section Groups can be nested (self-referencing `parent_id`), though practical use rarely exceeds 1 level deep.

### 6.9 SQLite PRAGMA Configuration

Set at every connection startup in `dependencies.py`:

```python
PRAGMA journal_mode=WAL;           # Concurrent reads during writes
PRAGMA synchronous=NORMAL;         # Fast but safe with WAL
PRAGMA busy_timeout=5000;          # Wait 5s instead of failing
PRAGMA foreign_keys=ON;            # Enable FK enforcement
PRAGMA cache_size=-64000;          # 64MB page cache
PRAGMA mmap_size=268435456;        # 256MB memory-mapped I/O
```

**Why `run_in_executor` instead of `aiosqlite`:** SQLite serializes at the file level, not the Python level. Using `aiosqlite` adds overhead without solving the real bottleneck. A thread-based executor (`run_in_executor`) with a standard `sqlite3` connection gives equivalent async behavior with less complexity. WAL mode handles read-vs-write contention.

### 6.10 Image/File Storage — Content-Addressed Filesystem

- **Never store in SQLite BLOBs.** BLOBs fragment the database, bloat backups, prevent streaming/range requests, and complicate CDN migration.
- **Path structure:** `uploads/images/{hash[:2]}/{hash[2:4]}/{full_hash}{ext}` — e.g., `uploads/images/ab/cd/abcdef123456.jpg`
- **Hash:** SHA-256 of file content. Deduplicates identical uploads.
- **Database:** `file_uploads` table tracks original filename, storage path, mime type, dimensions (for images).
- **Thumbnails:** Server-generated on upload, stored alongside originals.
- **Upload limit:** 10MB per file initially. Configurable.

### 6.11 Auth — NOT in MVP

Auth adds session management, CSRF, password hashing, user model, multi-tenant isolation, and login UI — all **zero value** for a single-user self-hosted app. Add it only if the user explicitly wants multi-user or internet-exposed access.

### 6.12 Backup Strategy

- SQLite `VACUUM INTO '/backup/crapper-keeper-{date}.db'` — daily cron job
- WAL checkpointing: `PRAGMA wal_checkpoint(TRUNCATE)` after each auto-save (or on app idle)
- Uploads directory backed up separately (rsync / tarball)

---

## 7. Build Order (Implementation Phases)

### Phase 1: Data Layer + Skeleton (3 days)
- [ ] Models: Notebook, Section, SectionGroup, Page (with tree_path, content_json, content_html, content_plain)
- [ ] Alembic initial migration with all PRAGMA settings and FTS5 virtual table + triggers
- [ ] `prose_mirror.py` utility: JSON ↔ HTML ↔ plain text conversion
- [ ] Basic CRUD routes: notebooks, sections (with Section Group membership), Section Groups, pages
- [ ] Jinja2 templates for full 4-zone layout
- [ ] Top bar: notebook selector (tabs/dropdown) with ➕ button
- [ ] Left pane: section list with Section Group folders (collapsible)
- [ ] Middle pane: page list with basic subpage indentation
- [ ] Right pane: placeholder showing selected page title
- [ ] Navigation: clicking notebook → section → page updates URL and swaps panes
- [ ] Section color picker + display (color on tab + accent on page title bar)

### Phase 2: Core Editor (2 days)
- [ ] TipTap integration (linear mode only)
- [ ] Basic toolbar: bold, italic, underline, strikethrough, headings (H1–H6), bullet list, numbered list
- [ ] TipTap initialization from `content_json`, re-serialization on save
- [ ] Manual save button (no auto-save yet)
- [ ] Verify `content_json` ↔ `content_html` ↔ `content_plain` round-trip
- [ ] Test FTS triggers fire correctly on manual save

### Phase 3: Auto-Save + Persistence (1 day)
- [ ] Debounced auto-save (1.5s) via TipTap `onUpdate`
- [ ] Save-on-blur (editor loses focus)
- [ ] Save-on-beforeunload (tab close)
- [ ] HTMX navigation guard (`htmx:beforeSwap` handler)
- [ ] Save indicator: "Saving..." (yellow) → "Saved" (green) → "Unsaved changes" (red)
- [ ] Error handling: retry on failure, red indicator until success
- [ ] Undo/redo compatibility: reset dirty flag after successful save

### Phase 4: Search (1 day)
- [ ] FTS5 virtual table creation in migration (already in Phase 1, verify sync triggers)
- [ ] Search route: `GET /search?q=...`
- [ ] Search UI: top bar search input with debounce (300ms)
- [ ] Results panel: replaces middle pane, shows Notebook > Section > Page path + highlighted snippet
- [ ] Snippet highlighting: `<mark>` tags at match positions mapped from `content_plain` to `content_html`
- [ ] Click result → navigate to page

### Phase 5: Media + Links (2 days)
- [ ] File upload infrastructure: `file_uploads` model, content-addressed storage, upload endpoint
- [ ] Image insertion: upload dialog, paste from clipboard, TipTap image extension
- [ ] Image display: inline in editor, thumbnail gallery view in page
- [ ] External hyperlinks: TipTap link extension, URL input dialog
- [ ] Internal page links: `/pages/{id}` URL format, `redirects` table lookup
- [ ] Copy link to page (right-click context menu)

### Phase 6: Organization (2 days)
- [ ] Subpage CRUD: indent/outdent buttons, drag to adjust level
- [ ] Position scoping: pages ordered within their parent scope
- [ ] `tree_path` generation and maintenance on reorder
- [ ] Collapse/expand parent in page list
- [ ] Drag-and-drop reorder for pages (SortableJS + HTMX)
- [ ] Drag-and-drop reorder for sections (SortableJS)
- [ ] Drag page between sections

### Phase 7: Search + Tags Refinement (1 day)
- [ ] Tags schema: `tag_definitions` + `tag_instances` tables
- [ ] Built-in tag types seeded on notebook creation
- [ ] Tag selector in editor toolbar
- [ ] Tag state toggling (To-Do checkbox, Priority selector)
- [ ] Tag summary page: `/tags/summary`
- [ ] Tag filtering in search results

### Phase 8: Polish (2 days)
- [ ] Keyboard shortcuts (Ctrl+N, Ctrl+Shift+N, Ctrl+E, Ctrl+S, etc.)
- [ ] Resizable panes (left/middle/right dividers)
- [ ] Dark mode (CSS variables + toggle in top bar)
- [ ] Status bar: save indicator, connection status, breadcrumb, section color accent
- [ ] Context menus (right-click on pages, sections, notebooks)
- [ ] Empty states (no notebooks yet, no pages in section)
- [ ] Loading states (skeleton loaders for panes)

### Phase 9: Tier 2 Features (v1.1)
- [ ] Free-form canvas: `page_mode` toggle, container model, double-click to place, drag reposition
- [ ] Tables: TipTap table extension
- [ ] File attachments: drag onto page, display as icon, download
- [ ] Audio recording: MediaRecorder API, playback widget
- [ ] Page templates: blank, meeting notes, to-do list, weekly planner
- [ ] Export: Markdown, HTML, PDF

---

## 8. Data Migration Path (SQLite Stays — No PostgreSQL Pretend)

**Decision:** Commit to SQLite for the foreseeable future.

The plan's original "SQLite (prod: PostgreSQL swap)" claim was naive. SQLAlchemy does NOT abstract FTS5 to `tsvector`, JSON operators, boolean handling, or pagination differences. The migration would require a complete search service rewrite. For a single-user self-hosted app, SQLite with WAL handles everything needed.

**If PostgreSQL ever becomes necessary:**
1. Add `asyncpg` / `psycopg2` / `sqlalchemy[postgresql]` to requirements
2. Write a new Alembic migration that creates equivalent schema (using `tsvector` + GIN index instead of FTS5)
3. Port `FTSService` to use `plainto_tsquery('english', query) @@ to_tsvector('english', content_plain)`
4. Data migration: use `pgloader` with a custom transformation for the JSON columns
5. Test every query path — SQLAlchemy hides the surface differences, not the deep ones

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Rich text + HTMX hybrid is fragile** | TipTap manages its own DOM. HTMX swaps destroy TipTap instances. Solution: `htmx:beforeSwap` handler forces a final save + TipTap teardown before any partial swap. Re-init TipTap on `htmx:afterSwap` for any partial that contains an editor. |
| **content_json / content_html divergence** | Single authoritative source (`content_json`). Both `content_html` and `content_plain` are *derived on every save*, never written directly. Add a nightly reconciliation job that rebuilds FTS from `content_json` for any pages where `updated_at > last_checked`. |
| **Undo/redo broken by auto-save** | Reset TipTap's dirty flag after each successful save. The editor's undo stack compares against the last-saved state, not the initial load state. Document this behavior: undo goes back to the last save point, not to the beginning of time. |
| **SQLite write contention during typing** | WAL mode + `busy_timeout=5000`. Batch the initial page load into a single response (all 4 zones). Use `run_in_executor` (not `aiosqlite`) for thread-based async DB access. |
| **Auto-save loses content during fast typing** | 1.5s debounce + save-on-blur + save-on-beforeunload. On save failure: red indicator + retry. Content is never lost unless the browser tab crashes between keystroke and debounce fire. |
| **Free-form canvas is complex** | Deferred to Tier 2. MVP ships linear mode only. Container model with nullable width/height for auto-expand. Data-loss warning on mode switch. |
| **Drag-and-drop across sections** | SortableJS handles the UX; on `onEnd`, send `POST /pages/{id}/move` with new `section_id` and `position`. Server re-generates `tree_path` for the affected subtree and returns updated page list. |
| **Image storage bloat** | Limit upload size (10MB). Content-addressed deduplication. Server-generated thumbnails. Daily `VACUUM INTO` backup. |
| **SQLite backup** | Daily `VACUUM INTO '/backups/crapper-keeper-{date}.db'`. WAL checkpoint on app idle. Uploads backed separately via rsync. |

---

## 10. Development Setup

### Backend

```bash
cd Crapper\ Keeper/
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn sqlalchemy alembic jinja2 python-multipart
pip install httpx pytest pytest-asyncio  # for testing
```

### Frontend Assets

```bash
npm install -D tailwindcss @tailwindcss/cli

# MVP only — 6 packages, ~60KB gzipped
npm install @tiptap/core @tiptap/starter-kit
npm install @tiptap/extension-image @tiptap/extension-link
npm install @tiptap/extension-underline
npm install sortablejs

# Tier 2 additions (install when needed, not before)
# npm install @tiptap/extension-table @tiptap/extension-table-row
# npm install @tiptap/extension-table-cell @tiptap/extension-table-header
# npm install @tiptap/extension-text-align @tiptap/extension-highlight
```

**Icons:** Use `lucide-static` (pre-compiled SVG sprites from the Lucide project) instead of the `lucide` npm package — zero runtime JS cost. Include specific icons as inline SVGs or an SVG sprite sheet.

### Run Dev Server

```bash
make dev
# -> uvicorn app.main:app --reload on http://localhost:8000
```

### Makefile Goals

```makefile
dev:        # uvicorn with hot reload
migrate:    # alembic upgrade head
seed:       # python seed.py
test:       # pytest
backup:     # VACUUM INTO backup file
```

---

## Appendix: Changes From Initial Draft

This plan was reviewed by Nemotron (NVIDIA, performance focus) and GLM (Zhipu AI, architecture focus). Key changes incorporated:

| Change | Source | Section |
|--------|--------|---------|
| Vertical Tabs layout (3 zones, not 4) — notebook list in sidebar, not top-bar tabs | GLM + this review | 2.4, 5.1 |
| Section Groups promoted to Tier 1, Phase 1 | Both | 1.0, 7.0 |
| `content_json` made authoritative; `content_html` + `content_plain` derived | Both | 2.3, 6.2 |
| FTS5 targets `content_plain` (not HTML) | GLM | 3.2, 6.4 |
| Tags split into definitions + instances | GLM | 3.1, 6.5 |
| Internal links use standard URL paths (not `notebook://`) | GLM | 6.6 |
| Free-form canvas deferred to Tier 2 | Both | 1.0, 6.7 |
| Auto-save: 1.5s debounce (was 2s), save-on-blur, beforeunload | Nemotron | 6.3 |
| Undo/redo dirty flag reset on save | Both | 6.3 |
| SQLite WAL mode mandatory at connection | Both | 6.9 |
| `run_in_executor` instead of `aiosqlite` | Nemotron | 6.9 |
| Content-addressed file storage | GLM | 6.10 |
| HTMX navigation guard (`htmx:beforeSwap`) | GLM | 6.3 |
| Backup strategy added | Nemotron | 6.12 |
| Honest NPM dependency accounting | Nemotron | 10.0 |
| PostgreSQL migration aspirational, not trivial | Both | 8.0 |
| Container model with nullable width/height | GLM | 3.1, 6.7 |
| `tree_path` for efficient tree ordering | GLM | 3.3 |
| `redirects` table for page moves | GLM | 3.1 |
| Position scoped to parent context | GLM | 3.3 |
| Auth NOT in MVP (explicit reasoning) | Both | 6.11 |

---

*This plan is a living document. Update as implementation reveals better approaches.*
