# Architectural Review: Crapper Keeper — OneNote Clone

**Reviewer:** GLM (Zhipu AI) — Architectural Perspective
**Date:** 2026-07-16
**Scope:** Full data model, hierarchy design, storage strategy, build order, and architectural decisions

---

## Executive Summary

This is a **promising but structurally flawed** plan. It captures the surface-level behavior of OneNote but makes several fundamental errors in hierarchy modeling, storage strategy, and build dependency ordering. The most critical issue: the plan collapses OneNote's 4-level navigation into 3 panes, misplaces Section Groups as Tier 2, and encodes a canvas model that directly contradicts how OneNote containers actually behave. Below, I address each issue in order of severity, then propose concrete schema and build-order changes.

---

## 1. Hierarchy Design — The 4-Level Problem

### The Plan's Error

The plan states a **"Three-Pane Layout"**:
- Left: notebook + section list
- Middle: page list with subpage indentation
- Right: editor canvas

And the hierarchy is implicitly: Notebook → Section → Page → Subpage

### OneNote's Actual Hierarchy

OneNote has **four structural levels** that must be visible simultaneously:

```
Notebook ──┬── Section Group ──┬── Section ──┬── Page ──┬── Subpage
           │                   │             │           │
           │                   │             │    (indented, collapsible)
           │                   │             │
           │                   │    (tab strip, color-coded)
           │                   │
           │          (folder-like, holds ≥1 section)
           │
    (top-level, notebook selector dropdown)
```

### Why 3 Panes Is Wrong

OneNote's navigation is **not** 3-pane. It is:

1. **Notebook selector** (a dropdown/tab bar across the top, not a pane)
2. **Section tab strip** (horizontal tabs, color-coded, can be inside Section Groups)
3. **Page list** (vertical, with subpage indentation)
4. **Editor canvas** (the content area)

The plan collapses (1) and (2) into the left pane. This means:
- A user cannot see which notebook they're in while looking at the page list
- Section Groups have no visual home — they're just "folder-like groups" hidden in the section list
- The left pane gets overloaded: notebook selector + section tabs + section groups all fighting for horizontal space

### The Fix: 4-Zone Layout

```
┌──────────────────────────────────────────────────────────┐
│  Notebook Selector (dropdown/tabs, top bar)              │
├────────────┬────────────────────┬────────────────────────┤
│  Section   │  Page List         │  Editor Canvas         │
│  Tab Strip │  (with subpage     │  (TipTap + containers) │
│  (tabs,    │   indentation)     │                        │
│  colors)   │                    │                        │
│            │                    │                        │
│  [Section  │                    │                        │
│   Groups   │                    │                        │
│   expand-  │                    │                        │
│   able]    │                    │                        │
└────────────┴────────────────────┴────────────────────────┘
```

Left pane is **sections only** (with Section Group folders). Middle pane is **pages only** (with subpage tree). The notebook selector lives in a persistent top bar or the outermost navigation shell.

---

## 2. Section Groups Are Tier 1, Not Tier 2

### The Mistake

Section Groups are listed under **Tier 2 — Core Experience (v1.1)**, feature 2.5. This is indefensible.

### Why They're Fundamental

OneNote's organizational model is **Notebook → Section Group → Section → Page**. A notebook without Section Groups is a flat binder. Section Groups are what make OneNote a *hierarchical* notebook system rather than a wiki. Users routinely create Section Groups for:
- Academic terms (Fall 2026 → Lectures / Labs / Exams)
- Work projects (Project X → Design / Dev / QA)
- Personal (Finances → Banking / Investments / Taxes)

Without Section Groups, a notebook with 30+ sections becomes unusable. Section Groups are **the primary scalability mechanism** for OneNote notebooks.

### Recommendation

Move Section Groups **immediately after Page CRUD** in Tier 1. The build order should be:

1. Notebook CRUD
2. Section CRUD (with Section Group membership)
3. Section Group CRUD
4. Page CRUD
5. Subpage hierarchy

Otherwise, early users will create 50 flat sections, then the Section Group migration will be painful and backward-incompatible.

---

## 3. Tag System — Dangerously Underspecified

### The Plan's Description

> "Apply tags to any paragraph: To-Do (checkbox), Important (star), Question, Remember for Later, Definition. Tag summary page that collects all tagged items."

And later:

> "Tags: data-tag-type spans, stored in tags table with page_id, container_id, type, checked state."

### OneNote's Actual Tag System

OneNote tags are **multi-dimensional** with distinct behaviors per type:

| Tag Type | Has State? | State Values | Display | Behavior |
|----------|-----------|--------------|---------|----------|
| To-Do | Yes | unchecked / checked / (optionally: date-completed) | Checkbox | Click toggles state; can be filtered by status |
| Important | No | — | Star (filled) | Static marker |
| Question | No | — | Question mark | Static marker |
| Remember for Later | No | — | Bookmark | Static marker |
| Definition | No | — | Dictionary icon | Static marker |
| Priority | Yes | 1 (high) / 2 (medium) / 3 (low) | Numbered icon | Sortable, filterable |
| Meeting | No | — | Calendar icon | Static marker |
| Address | No | — | Map pin | Static marker |
| Phone | No | — | Phone icon | Static marker |
| **Custom Tags** | **Arbitrary** | User-defined | User-defined | User-defined |

### The Problem

The plan's model — a single `tags` table with `type` and `checked` — is **only adequate for To-Do**. It fails for:
- **Priority tags**: need a `value` field (1-3) and numeric comparison in filters
- **Custom tags**: need a separate tag-definition table with icon/color/behavior
- **Search filtering**: "show all unchecked To-Do items" vs "show all Priority 1 items" require different query predicates

### Proposed Schema

```sql
CREATE TABLE tag_definitions (
    id INTEGER PRIMARY KEY,
    notebook_id INTEGER REFERENCES notebooks(id),
    name TEXT NOT NULL,            -- "To-Do", "Important", custom
    tag_type TEXT NOT NULL,        -- 'todo', 'flag', 'priority', 'custom'
    icon TEXT,                     -- lucide icon name
    color TEXT,                    -- hex color
    has_state BOOLEAN DEFAULT FALSE,
    state_schema TEXT,             -- JSON: e.g. {"checked": "boolean", "priority": "integer"}
    is_custom BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tag_instances (
    id INTEGER PRIMARY KEY,
    tag_definition_id INTEGER NOT NULL REFERENCES tag_definitions(id),
    page_id INTEGER NOT NULL REFERENCES pages(id),
    container_id TEXT,             -- NULL if page-level tag
    paragraph_id TEXT,             -- ProseMirror node position
    state JSON,                   -- {"checked": true} or {"priority": 1}
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

This supports OneNote's full tag taxonomy, custom tags, and any future tag type without schema migrations.

---

## 4. FTS5 + Dual Storage — A Divergence Disaster Waiting to Happen

### The Plan

> "Save: TipTap onUpdate -> 2s debounce -> POST /pages/{id}/save with both content_json (for rehydration) and content_html (for search)."

> "content_html (rendered HTML output), content_json (ProseMirror JSON for editor state restoration)"

### The Problem

`content_html` and `content_json` **will diverge**. Guaranteed. Reasons:

1. **Search indexing**: FTS5 indexes `content_html`. If a developer (or future feature) ever updates `content_html` without regenerating `content_json` (e.g., for display-only highlighting), the editor state breaks on rehydration.
2. **Image handling**: If images are stored as `<img src="/uploads/img_123.jpg">` in HTML but as a different representation in ProseMirror JSON, the two representations drift.
3. **HTML sanitization**: If the server strips unsafe HTML on save but preserves the original JSON, the HTML becomes a degraded derivative.
4. **Round-trip loss**: ProseMirror's `JSON → HTML` conversion is not injective. Two different JSON structures can produce the same HTML. Save the HTML, reload the JSON, get different behavior.

### The Fix: Choose One Authortitative Source

**Rule: `content_json` is authoritative. `content_html` is always derived.**

```python
# Service layer
def save_page(page_id, content_json):
    content_html = prose_mirror_json_to_html(content_json)
    db.execute("""
        UPDATE pages 
        SET content_json = ?, content_html = ?, 
            content_fts = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, [content_json, content_html, extract_plain_text(content_html), page_id])
```

- `content_html` is re-derived **on every save** from `content_json`
- `content_html` is never directly written (except during data migration)
- FTS5 indexes a **third field**: `content_fts` — a plain-text extraction of `content_html`
- Search results render from `content_html` (with snippet highlighting), but the editor always loads from `content_json`

### Improved Storage Schema

```sql
CREATE TABLE pages (
    id INTEGER PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES sections(id),
    parent_page_id INTEGER REFERENCES pages(id),  -- for subpages
    title TEXT NOT NULL,
    content_json TEXT NOT NULL DEFAULT '{}',       -- authoritative: ProseMirror JSON
    content_html TEXT NOT NULL DEFAULT '',         -- derived: rendered HTML for display
    content_plain TEXT NOT NULL DEFAULT '',        -- derived: plain text for FTS
    position INTEGER NOT NULL DEFAULT 0,
    is_collapsed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- FTS5 virtual table on content_plain only
CREATE VIRTUAL TABLE pages_fts USING fts5(
    title, content_plain, content='pages', content_rowid='id'
);
```

**Why not index content_html?** HTML tags pollute FTS5 tokenization. A `<strong>` tag becomes a token. Indexing plain text gives better search results and avoids HTML-parsing edge cases in FTS5.

---

## 5. Free-Form Canvas Conflation

### The Plan

> "Free-Form Canvas: Click anywhere on the page to place a text container. Containers are positionable via drag."

> "Position stored as x,y per container."

> "TipTap instances inside draggable containers."

### What OneNote Actually Does

OneNote's canvas is **not** fixed-position divs. It is a **flow-based layout with position hints**. Key behaviors the plan's model breaks:

1. **Auto-expand**: When you type past the right edge of a container, the container widens. When you hit the bottom, it grows taller. Fixed-position `<div>` with `width` and `height` columns prevents this without resize handlers.
2. **Reflow**: If you move a container up, containers below it do not reflow. OneNote containers are genuinely independent.
3. **Overlap**: Containers can overlap (in OneNote, text from overlapping containers stacks).
4. **No grid**: OneNote has no implicit grid. The plan's `x, y` model is actually *correct* for the position data, but the **implementation** (fixed-size TipTap divs) breaks auto-expand.

### The Better Approach

```python
class Container(Base):
    __tablename__ = 'containers'
    id = UUID primary key
    page_id = FK to pages
    content_json = authoritative ProseMirror JSON
    content_html = derived
    x = Float, default 0.0   # left offset in px
    y = Float, default 0.0   # top offset in px
    width = Float, nullable=True   # NULL = auto-width (shrink-to-fit)
    height = Float, nullable=True  # NULL = auto-height (grow with content)
    z_index = Integer, default 0
    created_at = Timestamp
```

**Critical difference**: `width` and `height` are nullable. When NULL, the client measures the actual TipTap content and stores it. When non-NULL (user resized), it's a fixed size. This matches OneNote's behavior: containers are auto-sized by default but can be manually resized.

Also: **do not** give every page a "single container at (0,0)" for linear mode. Instead, have a `page_mode` column: `'linear' | 'freeform'`. In linear mode, all containers flow vertically (ignore x,y). In freeform mode, containers are independently positioned. Switching between modes should be a documented data-loss risk (as it is in OneNote when going between views).

---

## 6. Internal Link Scheme — `notebook://page-id` Is Naive

### The Problem

Three issues:

1. **`notebook://` is not a registered URI scheme in any browser.** It will not be clickable from native apps (email, chat, other documents). Even within the app, you need a custom click handler to intercept `notebook://` links.

2. **It encodes only `page-id`**, not the full path. If a page moves to a different section, all existing links break with no way to redirect because there's no location-aware resolution.

3. **OneNote's actual behavior**: Right-click a page → "Copy Link to Page" → produces a URL that includes the notebook path *and* a `page-id` query parameter, e.g., `onenote:https://.../Notebook/Section.one#page-id&...`. This allows resolution by path first, with page-id as fallback.

### The Fix

Use **standard URL paths** as the link target, with a **canonical ID-based fallback**:

```
/crapper/notebooks/{notebook_id}/sections/{section_id}/pages/{page_id}
```

Internal links store the `page_id`. When rendering, the server resolves:
1. Look up page by ID
2. If page exists, render the link as a standard `<a href="/pages/{page_id}">` 
3. If page was moved, find its new path and redirect (store a `redirects` table for moved pages)

For external sharing: use the full URL path, which is always resolvable.

The `notebook://` scheme adds complexity with zero benefit over standard URL routing.

---

## 7. Build Order — Wrong Dependencies

### The Plan's Phase 2

> "Phase 2: Editor (3 days, includes TipTap + auto-save + free-form canvas + images + hyperlinks)"

### Why This Is Wrong

Auto-save depends on TipTap working, yes. But **free-form canvas depends on auto-save** (containers need persistence). **Images depend on file upload infrastructure** (not yet built). **Hyperlinks depend on the internal link resolution system** (not yet built).

The plan bundles **5 features** into one phase, each with distinct dependencies:

```
TipTap (core editor)
  ├── Auto-save (depends on TipTap onUpdate, needs save endpoint)
  ├── Free-form canvas (depends on Container model, auto-save, TipTap instances)
  │     └── Container positioning (depends on canvas JS, NOT on TipTap)
  ├── Images (depends on file upload, TipTap image extension)
  └── Hyperlinks (depends on internal link resolution, TipTap link extension)
```

### Corrected Build Order

```
Phase 1: Data Layer + Skeleton (3 days)
  - Models: Notebook, Section, SectionGroup, Page, Container
  - Alembic migrations
  - Basic CRUD routes (no editor)
  - Jinja2 templates for 4-zone layout
  - Notebook/section/page selection navigation working

Phase 2: Core Editor (2 days)
  - TipTap integration (linear mode only, single container at (0,0))
  - Basic toolbar (bold, italic, underline, lists, headings)
  - Manual save button (no auto-save yet)
  - Verify content_json ↔ content_html round-trip

Phase 3: Auto-Save + Persistence (1 day)
  - Debounced auto-save (2s)
  - Save indicator
  - Container persistence (content_json + content_html + content_plain)
  
Phase 4: Free-Form Canvas (2 days)
  - Container model migration (page_mode: linear/freeform)
  - Click-to-place container
  - Drag-reposition
  - Auto-expand containers (width/height NULL logic)
  - Mode toggle

Phase 5: Media + Links (2 days)
  - File upload infrastructure
  - Image insertion (upload + paste)
  - Internal hyperlink resolution
  - External links

Phase 6: Organization (3 days)
  - Subpage hierarchy (parent_page_id)
  - Drag-and-drop reorder (SortableJS)
  - Section Groups (SectionGroup CRUD, nesting)
  - Section colors
```

---

## 8. Architectural-Level Suggestions

### 8.1 SQLite — Use WAL Mode, Always

The plan uses SQLite. For an app that needs concurrent reads (auto-save + search + navigation all hitting the DB), **WAL (Write-Ahead Log) is mandatory**.

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;       -- safe with WAL, much faster
PRAGMA busy_timeout=5000;        -- 5s wait instead of immediate SQLITE_BUSY
PRAGMA foreign_keys=ON;          -- the plan uses FK but doesn't enable them
PRAGMA cache_size=-64000;        -- 64MB cache
PRAGMA mmap_size=268435456;      -- 256MB memory-mapped I/O
```

Without WAL, auto-save will block navigation queries, causing UI stutter. This is not optional — it should be in the first migration.

### 8.2 Images: Filesystem, Not BLOBs

**Never store images as BLOBs in SQLite.** Reasons:
- SQLite BLOBs fragment the database file over time (vacuum is slow)
- Backup size balloons (images never compress well in SQLite pages)
- You can't serve BLOBs efficiently via FastAPI (need streaming, range requests)
- CDN/cloud migration becomes a data migration nightmare

**Store on filesystem** (as the plan correctly states) with this schema:

```sql
CREATE TABLE file_uploads (
    id INTEGER PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES pages(id),
    filename TEXT NOT NULL,            -- original filename
    storage_path TEXT NOT NULL UNIQUE, -- e.g., uploads/images/ab/cd/abcdef123.jpg
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    width INTEGER,                    -- for images
    height INTEGER,                   -- for images
    thumbnail_path TEXT,              -- for gallery view
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Use **content-addressed storage** (hash-based paths) to deduplicate identical uploads.

### 8.3 Auth: NOT Needed for MVP

The plan says "Auth: None (local-first) or simple session-based. Single-user by default. Add password gate if shared."

This is correct. **Do not add auth in MVP.** Auth adds:
- Session management (cookie handling, CSRF, expiry)
- Password hashing (bcrypt/argon2)
- User model + migrations
- Persistence layer isolation (multi-tenant queries)
- Login/logout UI + error states
- Auth-related test surface area

All of this is **zero value** for a single-user self-hosted app. Add it only if the user explicitly wants multi-user or internet-exposed access.

### 8.4 Content_json vs Content_html — Who Is Authoritative?

I answered this above, but to be explicit:

**`content_json` is authoritative.** Always.

- **Write path**: TipTap emits JSON → POST to server → server generates HTML + plain text → store all three
- **Read path (editor)**: Server returns `content_json` → TipTap rehydrates from JSON
- **Read path (search/display)**: Server returns `content_html` for rendering, `content_plain` for FTS
- **Migration**: If you ever change the HTML renderer, you regenerate `content_html` and `content_plain` from `content_json` in a background job

**Never write `content_html` directly.** If you need to modify page content server-side (e.g., find-and-replace), modify `content_json` via ProseMirror's programmatic API, then regenerate.

### 8.5 Free-Form Canvas: Positioned vs Flow

The plan conflates free-form with positioned divs. The actual implementation path:

1. **Linear mode** (default): All containers stack vertically. `x` and `y` are ignored. CSS: `display: flex; flex-direction: column;`
2. **Freeform mode**: Canvas is `position: relative; overflow: auto;`. Each container is `position: absolute; left: {x}px; top: {y}px;`. Containers have `min-width` / `min-height` but can grow.
3. **Mode switching**: Warn user about potential layout changes. On switch to freeform, auto-position containers in a grid. On switch to linear, stack them vertically in order of `(y, x)`.
4. **Container auto-expand**: TipTap's `onUpdate` handler measures the rendered content and updates `width`/`height` if they are NULL. This gives OneNote's "type and the box grows" behavior.

### 8.6 OneNote's "Click Anywhere" Isn't Clicking—It's Double-Click

Small UX detail: OneNote's click-anywhere is actually **double-click** to create a new container, then type. A single click selects existing containers. The plan should distinguish these two actions.

### 8.7 Subpages: More Than Just Indentation

The plan says: "Indent a page beneath another to make it a subpage. Collapse/expand parent."

OneNote subpages have additional behaviors:

1. **Subpages belong to the parent page**, not to the section. The plan's `parent_page_id` FK is correct.
2. **Subpages can have their own subpages** (one level deep in practice, but tree in theory). The plan supports this via the recursive FK.
3. **Collapsing a parent hides its subpages** in the page list. This needs a `is_collapsed` column on the *view* (user preference), not on the data. Two users (or sessions) may want different collapse states.
4. **Subpages are ordered within the parent**. The plan's `position` column on `pages` is global within a section, not scoped to parent. This is wrong: position should be scoped to the parent scope (`section_id` for top-level pages, `parent_page_id` for subpages).

### Fix: Position Scoping

```sql
CREATE TABLE pages (
    ...
    section_id INTEGER NOT NULL REFERENCES sections(id),
    parent_page_id INTEGER REFERENCES pages(id),
    position INTEGER NOT NULL DEFAULT 0,
    -- position is scoped:
    --   if parent_page_id IS NULL: position is within section_id
    --   if parent_page_id IS NOT NULL: position is within parent_page_id
    ...
);
```

Or, use a materialized path / nested set for safe reordering:

```sql
ALTER TABLE pages ADD COLUMN tree_path TEXT;
-- e.g., "0001/0002/0003" where each segment is zero-padded position
-- Enables ORDER BY tree_path for correct tree ordering without recursive CTEs
```

---

## 9. Additional Concerns

### 9.1 TipTap + HTMX: The Escape Hatch

The plan acknowledges TipTap as an "escape hatch" JS widget. This is the **hardest part** of the architecture to get right. TipTap manages its own DOM. HTMX manages DOM swaps. When HTMX swaps a partial that contains a TipTap instance:

- The old TipTap instance's DOM is destroyed
- The new TipTap instance needs to re-initialize from the incoming JSON
- Any unsaved content is lost

**Solution**: The auto-save debounce must fire **before** any HTMX navigation event. Use the `htmx:beforeSwap` event to trigger a final save:

```javascript
document.body.addEventListener('htmx:beforeSwap', function(evt) {
    if (currentEditor && currentEditor.isDirty) {
        evt.preventDefault();
        forceSave().then(() => htmx.trigger('.page-list', 'refresh'));
    }
});
```

This should be part of the core editor integration, not an afterthought.

### 9.2 Section Colors: Persistence Model

The plan says: "Color-coded section tabs (OneNote style). Color persists in sidebar and tab strip."

The color should be on the **Section** model, not the notebook:

```sql
ALTER TABLE sections ADD COLUMN color TEXT DEFAULT '#5B9BD5';  -- OneNote default blue
```

Also, OneNote uses the section color in two places: (1) the section tab itself, and (2) the page title bar (as a thin accent line). The plan should specify both.

### 9.3 Search: Snippets Need Position Data

The plan says "results show notebook > section > page path with highlighted snippets." FTS5 supports `snippet()` and `highlight()` functions, but they work on the raw indexed text. If `content_plain` is your indexed text, the highlight offsets correspond to positions in `content_plain`, not `content_html`. To render highlights in HTML, you need to:

1. Find match offsets in `content_plain` using FTS5's `highlight()`
2. Map those offsets back to positions in `content_html` (non-trivial for tags)
3. Insert `<mark>` elements at mapped positions

**Alternative**: Store offset mappings in a separate table or use FTS5's `=content` sync with `content_html` but strip tags in the tokenizer. This is fragile. The robust approach is to build a simple offset mapper.

### 9.4 Undo/Redo + Auto-Save Conflict

TipTap has built-in undo/redo (history stack). Auto-save saves to the server. If the user:
1. Types "hello"
2. Auto-save fires (saves "hello")
3. User undoes (content is now "")
4. User expects Ctrl+Z to undo, but auto-save already persisted "hello"
5. User navigates away → page reloads → "hello" is back

**Fix**: The undo stack must be compared against the **last saved state**, not the initial state. TipTap's `editor.isDirty` compares against the last `editor.getJSON()`, which handles this if `content_json` is always passed on load. But auto-save must **reset the dirty flag** after saving:

```javascript
function autoSave(pageId, editor) {
    const content = editor.getJSON();
    fetch(`/pages/${pageId}/save`, {
        method: 'POST',
        body: JSON.stringify({ content_json: content })
    }).then(() => {
        // Reset TipTap's dirty tracking
        editor.currentContent = content;  // pseudo-code
    });
}
```

### 9.5 PostgreSQL Migration Path

The plan says "SQLite (prod: PostgreSQL swap)" via SQLAlchemy. This is **not trivial**. SQLite and PostgreSQL differ in:
- JSON operators (`->>` vs `->>` — actually compatible, but be careful)
- Full-text search (FTS5 vs `tsvector`/`tsquery` — completely different)
- Pagination (OFFSET/LIMIT works, but keyset pagination differs)
- Boolean handling (0/1 vs true/false)
- Connection pooling (SQLite serializes, PostgreSQL needs pgBouncer)

**Recommendation**: Either commit to SQLite (it scales fine for single-user with WAL) or start with PostgreSQL via Docker if multi-user is a real requirement. Don't pretend the swap is "abstracted by SQLAlchemy" — it isn't. The FTS5 → `tsvector` migration alone will require a complete search service rewrite.

---

## 10. Summary of Concrete Changes

### Schema Changes (Priority Order)

| Change | Reason |
|--------|--------|
| Add `content_plain` column to `pages` | FTS5 must index plain text, not HTML |
| Change `content_html` to nullable, derived from `content_json` | Single source of truth |
| Add `page_mode` column (`'linear' | 'freeform'`) | Disambiguate layout modes |
| Make `width`/`height` on containers nullable | Auto-expand when NULL |
| Split tags into `tag_definitions` + `tag_instances` | Multi-dimensional tags with state |
| Scope page `position` to parent context | Subpages need independent ordering |
| Add `tree_path` column to `pages` | Efficient tree ordering |
| Add `redirects` table for moved pages | Graceful internal link resolution |
| Add `PRAGMA journal_mode=WAL` to SQLite connection | Prevent write-vs-read contention |

### Build Order Changes

| Phase | Original | Corrected |
|-------|----------|-----------|
| 1 | Skeleton (Models, CRUD, layout) | Data Layer + 4-zone Skeleton incl. Section Groups |
| 2 | Editor (TipTap + auto-save + canvas + images + links) | Core Editor (TipTap only, linear mode only, manual save) |
| 3 | Organization (dnd, subpages, section groups) | Auto-Save + Container Persistence |
| 4 | Search & Tags | Free-Form Canvas |
| 5 | Polish | Media + Links |
| 6 | Tier 2 | Organization (dnd, subpages, section groups) |
| 7-9 | — | Search + Tags, Polish, Tier 2 features |

### Architectural Decisions

| Decision | Recommendation |
|----------|---------------|
| SQLite journal mode | WAL (PRAGMA journal_mode=WAL) |
| Image storage | Filesystem with content-addressed paths |
| Auth in MVP | No — add post-MVP only if multi-user needed |
| Authoritative content source | `content_json` (always), `content_html` derived |
| Internal links | Standard URL paths with page_id fallback |
| Notebook→Section Group→Section→Page in UI | 4-zone layout (not 3-pane) |
| Section Groups priority | Move to Tier 1, build in Phase 1 |

---

GLM (Zhipu AI)
Architectural Review Completed
