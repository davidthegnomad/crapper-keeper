# Focused Review: Notebook Selector UX

**Focus:** How does OneNote actually display and let users switch between notebooks?

---

## Current Plan's Design (Section 2.4)

```
┌──────────────────────────────────────────────────────────────┐
│  📓 My Notes  📗 Work  📘 Personal  ➕          🔍 Search   │  ← Top bar
├────────────────┬─────────────────────┬────────────────────────┤
│  Section tabs  │  Page list          │  Editor                │
...
```

"Notebook tabs across the top bar." This is **not** how OneNote works.

---

## How OneNote Actually Does It

### Vertical Tabs Mode (modern default, Windows)
The left sidebar has the notebook list **at its top**, above sections and pages:

```
┌───────────────────────────────────────────────────────────┐
│  [≡]  ⌕                                                🔍│  ← Title bar (thin)
├──────────────┬────────────────────────────────────────────┤
│ 📓 My Notes  │                                            │
│ 📗 Work      │  ← Notebook list (collapsible via ≡)      │
│ 📘 Personal  │                                            │
│───────────── │                                            │
│ ○ Section A  │              Editor canvas                 │
│ ○ Section B◉ │                                           │
│ ○ Section C  │                                            │
│───────────── │                                            │
│ 📄 Page 1    │                                            │
│ 📄 Page 2    │                                            │
│   ↳ Sub 2a   │                                            │
│ 📄 Page 3    │                                            │
└──────────────┴────────────────────────────────────────────┘
```

Key behaviors:
- Notebook list is at the **top of the left navigation pane**
- Can be **collapsed** to just icons (three-vertical-lines button)
- Below notebooks: section tabs (vertical)
- Below sections: page list
- All in **one** scrollable left sidebar
- The editor is everything to the right

### Horizontal Tabs Mode (classic)
- Sections are **tabs across the top**
- Pages are on the left
- Notebook selector is a **dropdown** in the title bar

```
┌───────────────────────────────────────────────────────────┐
│  [▼ My Notes]   Section A  Section B  Section C   ➕    🔍│  ← Notebook dropdown
├───────────────────────────────────────────────────────────┤
│  📄 Page 1     ┌───────────────────────────────────────┐  │
│  📄 Page 2     │                                       │  │
│    ↳ Sub 2a    │          Editor canvas               │  │
│  📄 Page 3     │                                       │  │
│  [+ Page]      └───────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### OneNote for Web
- **Notebook dropdown** at the top-left above the section tabs
- Sections are horizontal tabs at the top
- Pages are on the left
- Navigation button (≡) to show/hide the left sidebar

---

## Problem With the Plan's "Top Bar Notebook Tabs"

| OneNote Actual Behavior | Plan's "Top Bar Tabs" | Issue |
|-------------------------|----------------------|-------|
| Notebook list is in the **left navigation pane** (vertical) or a **dropdown** (horizontal/web) | Notebooks are **horizontal tabs** across the entire top bar | Not how OneNote works. Tabs across the top would waste horizontal space and look more like Chrome tabs than OneNote. |
| Current notebook is **always visible** in the left pane's top section | Current notebook name would be in the top bar, consuming a full row | The top bar should be thin (app name + search + settings), not a full notebook selector bar. |
| Notebook switch is a **dropdown click or sidebar click** | Notebook switch would be clicking a tab | Tabs imply all notebooks are equally visible, which conflicts with the collapsible notebook list behavior. |
| Notebook list is **scrollable** when you have many notebooks | Tabs would either overflow horizontally or wrap | A list in the sidebar handles many notebooks naturally. |
| The left sidebar's notebook section is **collapsible** to icons | Tabs would need a separate collapse mechanism | OneNote's ≡ collapse button is part of the notebook list itself. |

---

## Recommendation: Match OneNote's Actual Layout

### Option A: Vertical Tabs Mode (Recommended — matches modern OneNote)

```
┌───────────────────────────────────────────────────────────┐
│  ☰ Crapper Keeper         🔍 [Search...]  [⚙]  [◻]     │  ← Thin title bar
├──────────────┬────────────────────────────────────────────┤
│ 📓 My Notes  │┌────────────────────────────────────────┐  │
│ 📗 Work      ││  ○ Section A  ○ Section B◉ ○ Section C│  │
│ 📘 Personal  │├────────────────────────────────────────┤  │
│ [≡ collapse] ││  📄 Page 1                            │  │
│───────────── ││  📄 Page 2                            │  │
│ ○ Section A  ││    ↳ Subpage 2a                      │  │
│ ○ Section B◉ ││  📄 Page 3                            │  │
│ ○ Section C  ││                                       │  │
│───────────── ││  ┌────────────────────────────────┐   │  │
│ 📄 Page 1    ││  │ Bold  Italic  U  H1  H2  ⋯   │  │  │
│ 📄 Page 2    ││  │                                │  │  │
│   ↳ Sub 2a   ││  │ Click and type...             │  │  │
│ 📄 Page 3    ││  │                                │  │  │
│              ││  └────────────────────────────────┘   │  │
└──────────────┴┴────────────────────────────────────────┘──┘
```

**Single scrollable left sidebar** with three stacked sections:
1. **Notebook list** (top) — collapsible to icons via ≡ button
2. **Section tabs** (middle) — vertical list, color-coded
3. **Page list** (bottom) — with subpage indentation

### Option B: Horizontal Tabs + Notebook Dropdown (matches web/classic)

```
┌───────────────────────────────────────────────────────────┐
│  [▼ My Notes ▼]  Section A  Section B◉  Section C  ➕  🔍│  ← Notebook dropdown
├───────────────────────────────────────────────────────────┤
│  📄 Page 1    ┌────────────────────────────────────────┐  │
│  📄 Page 2    │  Bold  Italic  U  H1  H2  ⋯         │  │
│    ↳ Sub 2a  │                                        │  │
│  📄 Page 3    │  Click and type...                    │  │
│  [+ Page]     │                                        │  │
│               └────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────┤
│  Saved  ·  My Notes > Section B > Page 2                  │  ← Status bar
└───────────────────────────────────────────────────────────┘
```

**Notebook dropdown** sits next to the section tabs in the app bar. Pages are on the left.

---

## Additional UX Details to Match OneNote

### 1. Currently selected notebook is visually distinct
The active notebook has a different background color or left border accent. In vertical tabs mode, only one notebook's sections are shown at a time.

### 2. Notebook list collapse ≡ button
In vertical tabs mode, the three-vertical-lines button collapses the notebook list to a narrow strip showing just notebook icons. Hovering expands it. This is explicitly mentioned in Microsoft's docs as "the three-vertical-lines button at the top of the notebook list."

### 3. Notebooks are "open" or "closed"
OneNote doesn't show ALL notebooks at once. It keeps notebooks "open" (available in the list) or "closed" (File > Close). Switching between open notebooks is instant. Add a notebook requires a separate action.

### 4. Notebook color
OneNote assigns a default color to each notebook icon (📓 blue, 📗 green, 📘 purple, etc.). The plan should include notebook-level color/icon settings, not just section colors.

### 5. Section accent colors
In vertical tabs mode, the section color appears as:
- A colored bar on the left edge of the section in the tab list
- An accent line at the top of the page title area
This is separate from notebook color.

### 6. New notebook flow
Click "Add notebook" → opens a dialog: name + color + maybe template. The notebook appears in the list immediately. OneNote creates the default "Section 1" and "Untitled Page" automatically. This should be in the plan.

### 7. Notebook switcher is NOT the same as section navigation
A notebook switch changes the entire left sidebar content (all sections and pages). A section switch only changes the page list and editor. The plan should make this distinction clear.

---

## Proposed Update to Section 2.4 (Layout)

Replace the 4-zone "notebook tabs across top bar" with the **Vertical Tabs layout** (Option A above). The updated zones are:

1. **Title bar** (thin, top) — App name, search bar, settings gear, dark mode toggle
2. **Left sidebar** (scrollable, single column) — Three stacked regions:
   - **Notebook list** (collapsible top section with ≡ button)
   - **Section list** (vertical tabs with color bars + section group folders)
   - **Page list** (with subpage indentation, collapse/expand)
3. **Editor canvas** (everything to the right) — TipTap editor, floating toolbar

This eliminates the need for a 4th zone, matches OneNote's modern vertical tabs exactly, and keeps the top bar thin.
