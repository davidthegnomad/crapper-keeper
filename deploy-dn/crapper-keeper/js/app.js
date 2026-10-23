/**
 * Crapper Keeper — App Shell
 * Client-side rendering + event handling. Replaces all Jinja2 templates.
 */

import './editor.js';
import {
    getNotebooks, createNotebook, deleteNotebook,
    getSections, getSection, createSection, deleteSection,
    getSectionGroups,
    getPages, getPage, createPage, savePage, deletePage, movePage,
    searchPages, uploadImage, seedIfEmpty,
    initAuth, signInWithGoogle, signInWithApple, signOutUser,
    deleteCurrentAccount, getRuntimePlatform
} from './firebase-db.js';
import {
    escapeHtml,
    htmlToPlain,
    markdownToHtml,
    mountPreview,
    normalizePageMode,
    renderHtmlPreview,
    renderMarkdownPreview,
    getSourceView,
    setSourceView,
} from './render-modes.js';
import { initNavDnD } from './nav-dnd.js';
import { mountShellViews } from './shell-views.js';
import { mountAssistant } from './assistant.js';
import { buildRagFiles, buildSingleMarkdown, buildZip, ragZipName } from './rag-export.js';
import { runToolCall } from './tool-run.js';

// ── State ───────────────────────────────────────────────────────────────────

let state = {
    notebooks: [],
    currentNotebookId: null,
    sections: [],
    groups: [],
    currentSectionId: null,
    pages: [],
    currentPageId: null,
    currentPage: null,
};

// ── Notebook tab colors (theme palette slots 1–8; never the UI background) ───

const TAB_SLOT_COUNT = 8;

/** Stable 1–8 from id when colorSlot isn't stored yet. */
function hashTabSlot(id) {
    let h = 2166136261;
    const s = String(id || '');
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % TAB_SLOT_COUNT + 1;
}

function notebookTabSlot(nb) {
    const n = Number(nb?.colorSlot);
    if (Number.isInteger(n) && n >= 1 && n <= TAB_SLOT_COUNT) return n;
    return hashTabSlot(nb?.id);
}

/** Semi-random slot; avoids neighbors' colors when possible. */
function pickTabSlot(existingNotebooks = []) {
    const used = new Set(existingNotebooks.map(notebookTabSlot));
    const pool = [];
    for (let s = 1; s <= TAB_SLOT_COUNT; s++) {
        if (!used.has(s)) pool.push(s);
    }
    const choices = pool.length ? pool : Array.from({ length: TAB_SLOT_COUNT }, (_, i) => i + 1);
    return choices[Math.floor(Math.random() * choices.length)];
}

// ── Render Functions ────────────────────────────────────────────────────────

function renderNotebookTabs() {
    const container = document.querySelector('.tk-tabs-container');
    if (!state.notebooks.length) {
        container.innerHTML = `<div class="tk-tabs-container" style="padding:12px;font-size:11px;color:var(--text-tertiary);text-align:center;">
            <input type="text" id="seed-notebook" placeholder="First notebook..." autofocus
                   style="width:100%;padding:4px 8px;border:1px solid var(--border-default);border-radius:4px;font-size:11px;outline:none;">
        </div>`;
        wireDnD();
        return;
    }
    container.innerHTML = state.notebooks.map((nb, i) => {
        const slot = notebookTabSlot(nb);
        return `
        <a href="#" class="tk-tab tk-tab-${i + 1} ${nb.id === state.currentNotebookId ? 'tk-tab-active' : ''}"
           style="--tab-color:var(--tk-${slot});--tab-index:${i + 1}"
           data-nb-id="${escapeHtml(nb.id)}" title="${escapeHtml(nb.title)}">
            <span class="drag-handle nb-drag-handle">⋮⋮</span>
            <span class="tk-tab-label">${escapeHtml(nb.title)}</span>
            <button type="button" class="row-delete" data-delete-nb="${escapeHtml(nb.id)}" title="Delete notebook">×</button>
        </a>`;
    }).join('') + `
        <button type="button" class="tk-tab tk-tab-add" id="btn-add-nb"
                style="position:absolute;top:${state.notebooks.length * 88 + 16}px;left:0;font-size:16px;padding-left:10px;min-width:30px;"
                title="New notebook">+</button>`;
    wireDnD();
}

function renderSections() {
    const container = document.getElementById('section-list');
    const addForm = document.getElementById('section-add-form');

    if (!state.currentNotebookId) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">Select a notebook</div>`;
        if (addForm) addForm.innerHTML = '';
        wireDnD();
        return;
    }

    if (!state.sections.length) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">No chapters yet</div>`;
    } else {
        let html = '';
        // Section Groups
        if (state.groups.length) {
            for (const sg of state.groups) {
                const groupSections = state.sections.filter(s => s.sectionGroupId === sg.id);
                html += `<div>
                    <div class="section-group-header"
                         _="on click toggle .hidden on next <div/>
                            if my firstChild.innerText == '▸' then set my firstChild.innerText to '▾' else set my firstChild.innerText to '▸' end">
                        <span>▸</span><span>${escapeHtml(sg.title)}</span>
                    </div>
                    <div class="hidden section-dnd-list">
                        ${groupSections.map(s => renderSectionItem(s)).join('')}
                    </div>
                </div>`;
            }
        }

        // Top-level sections
        const topSections = state.sections.filter(s => !s.sectionGroupId);
        html += `<div class="section-dnd-list">${topSections.map(s => renderSectionItem(s)).join('')}</div>`;
        container.innerHTML = html;
    }

    if (addForm) {
        addForm.innerHTML = `<input type="text" id="input-new-section" placeholder="+ Chapter"
            style="width:calc(100% - 16px);margin:4px 8px;padding:5px 10px;border:1px solid var(--border-default);border-radius:6px;background:var(--surface-white);font-size:11px;outline:none;">`;
    }
    wireDnD();
}

function renderSectionItem(s) {
    return `<div class="section-item-row section-dnd-item" data-section-id="${escapeHtml(s.id)}">
        <span class="drag-handle section-drag-handle">⋮⋮</span>
        <a href="#" class="section-item flex-1 ${s.id === state.currentSectionId ? 'active' : ''}"
           style="border-left-color:${s.color||'#5B9BD5'}" data-section-id="${escapeHtml(s.id)}">
            ${escapeHtml(s.title)}
        </a>
        <button type="button" class="row-delete" data-delete-section="${escapeHtml(s.id)}" title="Delete section">×</button>
    </div>`;
}

function renderPages() {
    const container = document.getElementById('page-list');
    const addForm = document.getElementById('page-add-form');

    if (!state.currentSectionId) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">Select a chapter</div>`;
        if (addForm) addForm.innerHTML = '';
        wireDnD();
        return;
    }

    if (!state.pages.length) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">No pages yet — add one below</div>`;
    } else {
        let html = '';
        for (const p of state.pages) {
            html += `<div class="page-dnd-item" data-page-id="${escapeHtml(p.id)}">
                <div class="page-item-row">
                    <span class="drag-handle page-drag-handle">⋮⋮</span>
                    ${p.subpages?.length ? `<span class="page-collapse-btn"
                        _="on click halt the event then toggle .hidden on the next <div/> then
                           if my innerText == '▸' set my innerText to '▾' else set my innerText to '▸' end">▸</span>` : `<span style="width:18px;"></span>`}
                    <a href="#" class="page-item ${p.id === state.currentPageId ? 'active' : ''}"
                       data-page-id="${escapeHtml(p.id)}">${escapeHtml(p.title)}</a>
                    <button type="button" class="row-delete" data-delete-page="${escapeHtml(p.id)}" title="Delete page">×</button>
                </div>`;
            if (p.subpages?.length) {
                html += `<div class="hidden">`;
                for (const sub of p.subpages) {
                    html += `<div data-page-id="${escapeHtml(sub.id)}">
                        <div class="page-item-row">
                            <span class="drag-handle">⋮⋮</span>
                            <span style="width:18px;"></span>
                            <a href="#" class="page-item subpage ${sub.id === state.currentPageId ? 'active' : ''}"
                               data-page-id="${escapeHtml(sub.id)}">${escapeHtml(sub.title)}</a>
                            <button type="button" class="row-delete" data-delete-page="${escapeHtml(sub.id)}" title="Delete page">×</button>
                        </div></div>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        container.innerHTML = html;
    }

    if (addForm) {
        addForm.innerHTML = `<input type="text" id="input-new-page" placeholder="+ Page"
            style="width:calc(100% - 16px);margin:4px 8px;padding:5px 10px;border:1px solid var(--border-default);border-radius:6px;background:var(--surface-white);font-size:11px;outline:none;">`;
    }
    wireDnD();
}

function wireDnD() {
    initNavDnD({
        refreshNotebooks: async () => {
            state.notebooks = await getNotebooks();
            renderNotebookTabs();
        },
        refreshSections: async () => {
            if (!state.currentNotebookId) return;
            state.sections = await getSections(state.currentNotebookId);
            state.groups = await getSectionGroups(state.currentNotebookId);
            renderSections();
        },
        refreshPages: async () => {
            if (!state.currentSectionId) return;
            state.pages = await getPages(state.currentSectionId);
            renderPages();
        },
    });
}

function modeSwitcherHtml(mode) {
    const items = [
        ['rich', 'Rich'],
        ['markdown', 'Markdown'],
        ['html', 'HTML/HTMX'],
    ];
    return `<div class="mode-switch" role="tablist" aria-label="Page format">
        ${items.map(([id, label]) => `
            <button type="button" class="mode-btn ${mode === id ? 'active' : ''}"
                    data-page-mode="${id}" role="tab" aria-selected="${mode === id}">${label}</button>
        `).join('')}
    </div>`;
}

function viewSwitcherHtml(view) {
    const items = [
        ['source', 'Source'],
        ['split', 'Split'],
        ['preview', 'Preview'],
    ];
    return `<div class="view-switch" role="tablist" aria-label="Source view">
        ${items.map(([id, label]) => `
            <button type="button" class="view-btn ${view === id ? 'active' : ''}"
                    data-source-view="${id}" role="tab" aria-selected="${view === id}">${label}</button>
        `).join('')}
    </div>`;
}

function richToolbarHtml() {
    return `
        <button class="toolbar-btn" data-tiptap="heading" data-level="1">H1</button>
        <button class="toolbar-btn" data-tiptap="heading" data-level="2">H2</button>
        <button class="toolbar-btn" data-tiptap="heading" data-level="3">H3</button>
        <span class="toolbar-separator"></span>
        <button class="toolbar-btn bold" data-tiptap="bold">B</button>
        <button class="toolbar-btn italic" data-tiptap="italic">I</button>
        <button class="toolbar-btn" data-tiptap="underline"><u>U</u></button>
        <button class="toolbar-btn" data-tiptap="strike"><s>S</s></button>
        <span class="toolbar-separator"></span>
        <button class="toolbar-btn" data-tiptap="bulletList">•≡</button>
        <button class="toolbar-btn" data-tiptap="orderedList">1≡</button>
        <button class="toolbar-btn" data-tiptap="taskList">☑</button>
        <span class="toolbar-separator"></span>
        <button class="toolbar-btn" data-tiptap="table">⊞</button>
        <button class="toolbar-btn" data-tiptap="blockquote">❝</button>
        <button class="toolbar-btn" data-tiptap="codeBlock">&lt;/&gt;</button>
        <span class="toolbar-separator"></span>
        <button class="toolbar-btn" data-tiptap="horizontalRule">—</button>
        <button class="toolbar-btn" data-tiptap="link">🔗</button>
        <button class="toolbar-btn" id="btn-upload-image">🖼</button>`;
}

function sourceHint(mode) {
    if (mode === 'html') {
        return `<span class="mode-hint">Renders HTML. Scripts, frames, and HTMX attributes are removed.</span>`;
    }
    return `<span class="mode-hint">GitHub-flavored Markdown with live preview.</span>`;
}

function tipTapLoadContent(page) {
    const raw = page.contentJson || '';
    try {
        const json = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
        if (json && json.type === 'doc') return json;
    } catch { /* fall through */ }
    if (page.contentSource) return page.contentSource;
    return '';
}

async function renderEditor() {
    const container = document.getElementById('editor-pane');
    if (!state.currentPageId) {
        if (typeof window.destroyEditor === 'function') window.destroyEditor();
        container.innerHTML = `<div class="empty-state"><div class="empty-inner">
            <h2>Welcome to Crapper Keeper</h2>
            <p>Select a page from the sidebar to get started.</p>
        </div></div>`;
        return;
    }

    const page = await getPage(state.currentPageId);
    state.currentPage = page;
    if (!page) return;

    const mode = normalizePageMode(page.pageMode);
    page.pageMode = mode;
    const section = state.sections.find(s => s.id === page.sectionId);
    const sectionColor = section?.color || '#5B9BD5';
    const view = getSourceView();
    const isSource = mode === 'markdown' || mode === 'html';

    if (typeof window.destroyEditor === 'function') window.destroyEditor();

    container.innerHTML = `
        <div class="editor-container ${isSource ? 'is-source' : ''} ${view === 'split' && isSource ? 'is-split' : ''}">
            <h1 id="page-title" class="page-title" contenteditable="true">${escapeHtml(page.title || 'Untitled Page')}</h1>
            <div class="page-accent" style="background:${sectionColor}"></div>
            <div id="editor-toolbar" class="editor-toolbar">
                ${modeSwitcherHtml(mode)}
                <span class="toolbar-separator"></span>
                ${isSource ? viewSwitcherHtml(view) : richToolbarHtml()}
                ${isSource ? sourceHint(mode) : ''}
            </div>
            <div class="editor-body">
                ${isSource ? `
                    <div class="source-split source-view-${view}">
                        <textarea id="source-editor" class="source-editor" spellcheck="true"
                            placeholder="${mode === 'html' ? 'Paste HTML or HTMX…' : 'Write Markdown…'}"></textarea>
                        <div id="ck-preview" class="ck-preview ${mode === 'html' ? 'ck-preview-html' : 'ck-preview-md'}"></div>
                    </div>
                ` : `<div id="editor-content" data-page-id="${state.currentPageId}"></div>`}
            </div>
            <input type="file" id="image-upload-input" accept="image/*" class="hidden">
        </div>`;

    const nb = state.notebooks.find(n => n.id === state.currentNotebookId);
    document.getElementById('breadcrumb').textContent =
        `${nb?.title || ''} › ${section?.title || ''} › ${page.title || ''}`;

    if (mode === 'rich') {
        if (typeof window.initEditor === 'function') {
            setTimeout(() => window.initEditor(state.currentPageId, tipTapLoadContent(page)), 50);
        }
        setupToolbar();
    } else {
        setupSourceEditor(page, mode);
    }

    setupModeSwitcher();
}

function setupModeSwitcher() {
    document.querySelector('.mode-switch')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-page-mode]');
        if (!btn) return;
        switchPageMode(btn.dataset.pageMode);
    });
    document.querySelector('.view-switch')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-source-view]');
        if (!btn) return;
        const view = btn.dataset.sourceView;
        setSourceView(view);
        const wrap = document.querySelector('.editor-container');
        const split = document.querySelector('.source-split');
        if (split) split.className = `source-split source-view-${view}`;
        if (wrap) wrap.classList.toggle('is-split', view === 'split');
        document.querySelectorAll('.view-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.sourceView === view);
            b.setAttribute('aria-selected', b.dataset.sourceView === view ? 'true' : 'false');
        });
    });
}

function setupSourceEditor(page, mode) {
    const ta = document.getElementById('source-editor');
    const preview = document.getElementById('ck-preview');
    if (!ta) return;
    ta.value = page.contentSource || '';
    refreshPreview(ta.value, mode, preview);
    ta.addEventListener('input', () => {
        refreshPreview(ta.value, mode, preview);
        scheduleSourceSave();
    });
}

function refreshPreview(src, mode, preview) {
    const html = mode === 'html' ? renderHtmlPreview(src) : renderMarkdownPreview(src);
    mountPreview(preview, html, { htmx: mode === 'html' });
}

function currentSourceText() {
    return document.getElementById('source-editor')?.value ?? state.currentPage?.contentSource ?? '';
}

async function switchPageMode(newMode) {
    newMode = normalizePageMode(newMode);
    const page = state.currentPage;
    if (!page || !state.currentPageId) return;
    const current = normalizePageMode(page.pageMode);
    if (current === newMode) return;

    let contentSource = page.contentSource || '';
    let contentJson = page.contentJson || '{}';
    let contentPlain = page.contentPlain || '';

    if (current === 'rich' && window.currentEditor) {
        const json = window.currentEditor.getJSON();
        contentJson = JSON.stringify(json);
        contentPlain = window.currentEditor.getText();
        contentSource = newMode === 'html'
            ? window.currentEditor.getHTML()
            : jsonToMd(json);
    } else if (current === 'markdown' || current === 'html') {
        contentSource = currentSourceText();
        contentPlain = current === 'html' ? htmlToPlain(contentSource) : contentSource;
        if (newMode === 'html' && current === 'markdown') {
            contentSource = markdownToHtml(contentSource);
        }
        if (newMode === 'rich') {
            const html = current === 'markdown' ? markdownToHtml(contentSource) : contentSource;
            contentJson = '{}';
            contentSource = html;
            contentPlain = htmlToPlain(html);
        }
    }

    try {
        await savePage(state.currentPageId, {
            pageMode: newMode, contentSource, contentJson, contentPlain,
        });
        state.currentPage = { ...page, pageMode: newMode, contentSource, contentJson, contentPlain };
        await renderEditor();
        markSaved();
    } catch (error) {
        console.error('Mode switch save failed:', error);
        const status = document.getElementById('save-status');
        if (status) status.textContent = '⚠ Save failed';
    }
}

// ── Toolbar ─────────────────────────────────────────────────────────────────

function setupToolbar() {
    const tb = document.getElementById('editor-toolbar');
    if (!tb) return;
    tb.onclick = function(e) {
        const btn = e.target.closest('[data-tiptap]');
        if (!btn || !window.currentEditor) return;
        const cmd = btn.dataset.tiptap, ed = window.currentEditor;
        switch (cmd) {
            case 'bold': ed.chain().focus().toggleBold().run(); break;
            case 'italic': ed.chain().focus().toggleItalic().run(); break;
            case 'underline': ed.chain().focus().toggleUnderline().run(); break;
            case 'strike': ed.chain().focus().toggleStrike().run(); break;
            case 'heading': ed.chain().focus().toggleHeading({level:parseInt(btn.dataset.level)||2}).run(); break;
            case 'bulletList': ed.chain().focus().toggleBulletList().run(); break;
            case 'orderedList': ed.chain().focus().toggleOrderedList().run(); break;
            case 'taskList': ed.chain().focus().toggleTaskList().run(); break;
            case 'table': ed.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run(); break;
            case 'blockquote': ed.chain().focus().toggleBlockquote().run(); break;
            case 'codeBlock': ed.chain().focus().toggleCodeBlock().run(); break;
            case 'horizontalRule': ed.chain().focus().setHorizontalRule().run(); break;
            case 'link':
                const url = prompt('Enter URL:');
                if (url) ed.chain().focus().setLink({href:url}).run();
                else ed.chain().focus().unsetLink().run();
                break;
        }
    };
    document.getElementById('btn-upload-image')?.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
            const file = input.files[0];
            if (!file) return;
            const url = await uploadImage(file);
            window.currentEditor?.chain().focus().setImage({src:url}).run();
        };
        input.click();
    });
}

// ── Event Handlers ──────────────────────────────────────────────────────────

async function flushUnsaved() {
    if (!saveDirty || !state.currentPageId) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const mode = normalizePageMode(state.currentPage?.pageMode);
    if (mode === 'rich' && window.currentEditor) {
        await window.saveToServer(window.currentEditor);
    } else if (mode === 'markdown' || mode === 'html') {
        await saveSourceToServer();
    }
}

function disarmSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveDirty = false;
}
window.ckFlush = flushUnsaved;
window.ckDisarmSave = disarmSave;

window.addEventListener('pagehide', () => { flushUnsaved(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUnsaved();
});
window.addEventListener('ck-notebook-sync', async (event) => {
    const open = event.detail && event.detail.open;
    disarmSave();
    try {
        if (open && (open.pageId || open.sectionId || open.notebookId)) {
            if (open.notebookId && open.notebookId !== state.currentNotebookId) await selectNotebook(open.notebookId);
            if (open.sectionId && open.sectionId !== state.currentSectionId) await selectSection(open.sectionId);
            if (open.pageId) await selectPage(open.pageId);
            else await refreshAll();
            return;
        }
        await refreshAll();
    } catch (err) {
        console.error(err);
    }
});

async function selectNotebook(nbId) {
    await flushUnsaved();
    state.currentNotebookId = nbId;
    state.currentSectionId = null;
    state.currentPageId = null;
    state.sections = await getSections(nbId);
    state.groups = await getSectionGroups(nbId);
    renderSections();
    renderPages();
    await renderEditor();
    renderNotebookTabs();
}

async function selectSection(sectionId) {
    await flushUnsaved();
    state.currentSectionId = sectionId;
    state.currentPageId = null;
    state.pages = await getPages(sectionId);
    renderSections();
    renderPages();
    await renderEditor();
}

async function selectPage(pageId) {
    if (pageId !== state.currentPageId) await flushUnsaved();
    state.currentPageId = pageId;
    await renderEditor();
    if (window.matchMedia('(max-width: 700px)').matches) {
        document.querySelector('.sidebar')?.classList.add('hidden');
    }
}

async function deleteNotebookById(id) {
    if (!id || !window.confirm('Delete this notebook and all of its pages?')) return;
    await flushUnsaved();
    await deleteNotebook(id);
    if (state.currentNotebookId === id) {
        state.currentNotebookId = null;
        state.currentSectionId = null;
        state.currentPageId = null;
        state.currentPage = null;
        state.sections = [];
        state.pages = [];
    }
    state.notebooks = await getNotebooks();
    if (!state.currentNotebookId && state.notebooks[0]) {
        await selectNotebook(state.notebooks[0].id);
        return;
    }
    renderNotebookTabs();
    renderSections();
    renderPages();
    await renderEditor();
}

async function deleteSectionById(id) {
    if (!id || !window.confirm('Delete this section and its pages?')) return;
    await flushUnsaved();
    await deleteSection(id);
    if (state.currentSectionId === id) {
        state.currentSectionId = null;
        state.currentPageId = null;
        state.currentPage = null;
        state.pages = [];
    }
    if (!state.currentNotebookId) return;
    state.sections = await getSections(state.currentNotebookId);
    if (!state.currentSectionId && state.sections[0]) {
        await selectSection(state.sections[0].id);
        return;
    }
    renderSections();
    renderPages();
    await renderEditor();
}

async function deletePageById(id) {
    if (!id || !window.confirm('Delete this page?')) return;
    if (state.currentPageId !== id) await flushUnsaved();
    else {
        clearTimeout(saveTimer);
        saveTimer = null;
        saveDirty = false;
    }
    await deletePage(id);
    if (!state.currentSectionId) return;
    state.pages = await getPages(state.currentSectionId);
    renderPages();
    if (state.currentPageId === id) {
        state.currentPageId = state.pages[0]?.id || null;
        state.currentPage = null;
        await renderEditor();
    }
}

async function handleAddNotebook(e) {
    e?.preventDefault?.();
    const title = window.prompt('New notebook name');
    if (!title?.trim()) return;
    const colorSlot = pickTabSlot(state.notebooks);
    const id = await createNotebook(title.trim(), { colorSlot });
    const sectionId = await createSection(id, 'Quick Notes');
    await refreshAll();
    state.currentNotebookId = id;
    state.sections = await getSections(id);
    state.groups = await getSectionGroups(id);
    renderNotebookTabs();
    await selectSection(sectionId);
}

async function handleSeedNotebook(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val) return;
    const colorSlot = pickTabSlot(state.notebooks);
    const id = await createNotebook(val, { colorSlot });
    const sectionId = await createSection(id, 'Quick Notes');
    await refreshAll();
    state.currentNotebookId = id;
    state.sections = await getSections(id);
    state.groups = await getSectionGroups(id);
    renderNotebookTabs();
    await selectSection(sectionId);
}

async function handleAddSection(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val || !state.currentNotebookId) return;
    const sectionId = await createSection(state.currentNotebookId, val);
    e.target.value = '';
    state.sections = await getSections(state.currentNotebookId);
    await selectSection(sectionId);
}

async function handleAddPage(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val || !state.currentSectionId) return;
    const pageId = await createPage(state.currentSectionId, val);
    e.target.value = '';
    state.pages = await getPages(state.currentSectionId);
    renderPages();
    await selectPage(pageId);
}

async function handleTitleBlur(e) {
    const title = e.target.innerText.trim();
    if (!title || !state.currentPageId) return;
    await savePage(state.currentPageId, { title });
}

async function handleSearch(e) {
    const q = e.target.value.trim();
    if (!q) {
        document.getElementById('search-results').classList.add('hidden');
        return;
    }
    const results = await searchPages(q);
    const container = document.getElementById('search-results');
    if (!results.length) {
        container.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--text-tertiary);text-align:center;">No results</div>`;
    } else {
        container.innerHTML = results.map(r => {
            const plain = escapeHtml((r.contentPlain || '').substring(0, 120));
            return `<a href="#" class="search-result-item" data-page-id="${escapeHtml(r.id)}">
                <div class="search-result-title">${escapeHtml(r.title || 'Untitled')}</div>
                <div class="search-result-snippet">${plain}</div>
            </a>`;
        }).join('');
    }
    container.classList.remove('hidden');
}

// ── Auto-save bridge (called by editor.js) ──────────────────────────────────

let saveTimer = null;
let saveDirty = false;

function markUnsaved() {
    saveDirty = true;
    const status = document.getElementById('save-status');
    if (status) status.textContent = '● Unsaved';
}

function markSaved() {
    saveDirty = false;
    const status = document.getElementById('save-status');
    if (status) status.textContent = '✓ Saved';
}

window.onEditorUpdate = function(editor) {
    clearTimeout(saveTimer);
    markUnsaved();
    saveTimer = setTimeout(() => window.saveToServer(editor), 1200);
};

function scheduleSourceSave() {
    clearTimeout(saveTimer);
    markUnsaved();
    saveTimer = setTimeout(saveSourceToServer, 1200);
}

async function saveSourceToServer() {
    if (!state.currentPageId) return;
    const mode = normalizePageMode(state.currentPage?.pageMode);
    const contentSource = currentSourceText();
    const contentPlain = mode === 'html' ? htmlToPlain(contentSource) : contentSource;
    try {
        await savePage(state.currentPageId, { contentSource, contentPlain, pageMode: mode });
        if (state.currentPage) {
            state.currentPage.contentSource = contentSource;
            state.currentPage.contentPlain = contentPlain;
        }
        markSaved();
    } catch (error) {
        const status = document.getElementById('save-status');
        if (status) status.textContent = '⚠ Save failed';
        console.error('Save failed:', error);
    }
}

window.saveToServer = async function(editor) {
    if (!state.currentPageId) return;
    const mode = normalizePageMode(state.currentPage?.pageMode);
    if (mode !== 'rich') {
        await saveSourceToServer();
        return;
    }
    if (!editor) return;
    const json = JSON.stringify(editor.getJSON());
    const plain = editor.getText();
    try {
        await savePage(state.currentPageId, { contentJson: json, contentPlain: plain, pageMode: 'rich' });
        markSaved();
    } catch (error) {
        const status = document.getElementById('save-status');
        if (status) status.textContent = '⚠ Save failed';
        console.error('Save failed:', error);
    }
};

// ── Init ────────────────────────────────────────────────────────────────────

async function refreshAll() {
    state.notebooks = await getNotebooks();
    renderNotebookTabs();
    if (state.currentNotebookId) {
        state.sections = await getSections(state.currentNotebookId);
        renderSections();
        if (state.currentSectionId) {
            state.pages = await getPages(state.currentSectionId);
            renderPages();
        }
    }
    await renderEditor();
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.textContent = msg || '';
}

async function init() {
    const platform = getRuntimePlatform();
    document.body.dataset.platform = platform;
    const versionEl = document.getElementById('app-version');
    if (versionEl) {
        try {
            versionEl.textContent = 'v' + String(__APP_VERSION__);
        } catch (_) {
            versionEl.textContent = 'v1.1.0';
        }
    }
    if (platform === 'ios') {
        document.getElementById('btn-apple-signin')?.classList.remove('hidden');
    }

    // Auth flow
    initAuth(async (user) => {
        if (user) {
            showAuthError('');
            document.getElementById('auth-overlay').style.display = 'none';
            const shell = document.getElementById('app-shell');
            shell.style.display = 'flex';
            shell.style.height = '100%';
            try {
                await seedIfEmpty();
                await refreshAll();
                if (state.notebooks.length && !state.currentNotebookId) {
                    state.currentNotebookId = state.notebooks[0].id;
                    state.sections = await getSections(state.currentNotebookId);
                    state.groups = await getSectionGroups(state.currentNotebookId);
                    renderSections();
                    if (state.sections.length) {
                        state.currentSectionId = state.sections[0].id;
                        state.pages = await getPages(state.currentSectionId);
                        renderPages();
                        if (state.pages.length) {
                            state.currentPageId = state.pages[0].id;
                            await renderEditor();
                        }
                    }
                }
            } catch (e) {
                console.error('Post-auth load failed:', e);
                showAuthError('Signed in, but data load failed: ' + (e.message || e));
                document.getElementById('auth-overlay').style.display = 'flex';
            }
        } else {
            document.getElementById('auth-overlay').style.display = 'flex';
            document.getElementById('app-shell').style.display = 'none';
        }
    });

    document.getElementById('btn-google-signin')?.addEventListener('click', async () => {
        showAuthError('');
        const btn = document.getElementById('btn-google-signin');
        const label = btn?.textContent;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Signing in…';
        }
        try {
            await signInWithGoogle();
        } catch (e) {
            console.error(e);
            showAuthError('Sign-in failed: ' + (e.message || e.toString()));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = label || '🔵 Sign in with Google';
            }
        }
    });

    document.getElementById('btn-apple-signin')?.addEventListener('click', async () => {
        showAuthError('');
        const btn = document.getElementById('btn-apple-signin');
        if (btn) btn.disabled = true;
        try {
            await signInWithApple();
        } catch (e) {
            console.error(e);
            showAuthError('Apple sign-in failed: ' + (e.message || e.toString()));
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    document.getElementById('btn-account')?.addEventListener('click', () => {
        document.getElementById('account-menu')?.classList.remove('hidden');
    });

    document.getElementById('btn-account-close')?.addEventListener('click', () => {
        document.getElementById('account-menu')?.classList.add('hidden');
    });

    document.getElementById('btn-signout')?.addEventListener('click', async () => {
        document.getElementById('account-menu')?.classList.add('hidden');
        await signOutUser();
    });

    document.getElementById('btn-delete-account')?.addEventListener('click', async () => {
        const confirmed = window.confirm(
            'Permanently delete your Crapper Keeper account? This cannot be undone.'
        );
        if (!confirmed) return;
        try {
            await deleteCurrentAccount();
        } catch (e) {
            console.error(e);
            window.alert(
                'Account deletion requires a recent sign-in. Sign out, sign back in, then try again.'
            );
        }
    });

    // Event delegation (tabs are re-rendered — don't bind to ephemeral nodes)
    document.querySelector('.tk-strip').addEventListener('click', async (e) => {
        const delNb = e.target.closest('[data-delete-nb]');
        if (delNb) {
            e.preventDefault();
            e.stopPropagation();
            await deleteNotebookById(delNb.dataset.deleteNb);
            return;
        }
        const addBtn = e.target.closest('#btn-add-nb, .tk-tab-add');
        if (addBtn) {
            e.preventDefault();
            await handleAddNotebook(e);
            return;
        }
        const tab = e.target.closest('[data-nb-id]');
        if (tab) {
            e.preventDefault();
            await selectNotebook(tab.dataset.nbId);
        }
    });
    document.querySelector('.tk-strip').addEventListener('keydown', async (e) => {
        if (e.target.id === 'seed-notebook') await handleSeedNotebook(e);
    });

    document.getElementById('section-list').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-delete-section]');
        if (del) {
            e.preventDefault();
            e.stopPropagation();
            await deleteSectionById(del.dataset.deleteSection);
            return;
        }
        const item = e.target.closest('[data-section-id]');
        if (item) await selectSection(item.dataset.sectionId);
    });
    document.addEventListener('keydown', (e) => {
        if (e.target.id === 'input-new-section' && e.key === 'Enter') handleAddSection(e);
    });

    document.getElementById('page-list').addEventListener('click', async (e) => {
        const del = e.target.closest('[data-delete-page]');
        if (del) {
            e.preventDefault();
            e.stopPropagation();
            await deletePageById(del.dataset.deletePage);
            return;
        }
        const item = e.target.closest('[data-page-id]');
        if (item) await selectPage(item.dataset.pageId);
    });
    document.addEventListener('keydown', (e) => {
        if (e.target.id === 'input-new-page' && e.key === 'Enter') handleAddPage(e);
    });

    document.getElementById('page-title')?.addEventListener('blur', handleTitleBlur);

    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('focus', () => document.getElementById('search-results')?.classList.remove('hidden'));
        searchInput.addEventListener('blur', () => setTimeout(() => document.getElementById('search-results')?.classList.add('hidden'), 200));
    }

    document.getElementById('search-results')?.addEventListener('click', async (e) => {
        const item = e.target.closest('[data-page-id]');
        if (!item) return;
        e.preventDefault();
        const page = await getPage(item.dataset.pageId);
        if (page) {
            const section = await getSection(page.sectionId);
            if (section?.notebookId && section.notebookId !== state.currentNotebookId) {
                await selectNotebook(section.notebookId);
            }
            if (page.sectionId && page.sectionId !== state.currentSectionId) {
                await selectSection(page.sectionId);
            }
            await selectPage(page.id);
        }
        document.getElementById('search-results').classList.add('hidden');
    });

    // Chapters / Pages vertical split
    function initSidebarSplit() {
        const sidebar = document.querySelector('.sidebar');
        const sectionPane = document.getElementById('section-pane');
        const resizer = document.getElementById('sidebar-v-resizer');
        if (!sidebar || !sectionPane || !resizer) return;

        try {
            const saved = Number(localStorage.getItem('ck-sidebar-split'));
            if (saved > 72) sectionPane.style.flex = `0 0 ${saved}px`;
        } catch (_) { /* ignore */ }

        const onPointerDown = (e) => {
            e.preventDefault();
            resizer.classList.add('is-dragging');
            resizer.setPointerCapture?.(e.pointerId);
            const startY = e.clientY;
            const startH = sectionPane.getBoundingClientRect().height;
            const creditH = document.querySelector('.sidebar-credit')?.offsetHeight || 0;
            const minH = 72;
            const maxH = Math.max(minH, sidebar.getBoundingClientRect().height - creditH - 8 - minH);

            const onMove = (ev) => {
                let newH = startH + (ev.clientY - startY);
                newH = Math.max(minH, Math.min(maxH, newH));
                sectionPane.style.flex = `0 0 ${newH}px`;
            };
            const onUp = (ev) => {
                resizer.classList.remove('is-dragging');
                resizer.releasePointerCapture?.(ev.pointerId);
                resizer.removeEventListener('pointermove', onMove);
                resizer.removeEventListener('pointerup', onUp);
                resizer.removeEventListener('pointercancel', onUp);
                try {
                    localStorage.setItem(
                        'ck-sidebar-split',
                        String(Math.round(sectionPane.getBoundingClientRect().height))
                    );
                } catch (_) { /* ignore */ }
            };
            resizer.addEventListener('pointermove', onMove);
            resizer.addEventListener('pointerup', onUp);
            resizer.addEventListener('pointercancel', onUp);
        };
        resizer.addEventListener('pointerdown', onPointerDown);
    }
    initSidebarSplit();

    function initSidebarWidthResizer() {
        const sidebar = document.querySelector('.sidebar');
        const resizer = document.getElementById('sidebar-h-resizer');
        if (!sidebar || !resizer) return;

        try {
            const saved = Number(localStorage.getItem('ck-sidebar-width'));
            if (saved >= 200 && saved <= 560) sidebar.style.width = `${saved}px`;
        } catch (_) { /* ignore */ }

        resizer.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            resizer.classList.add('is-dragging');
            resizer.setPointerCapture?.(e.pointerId);
            const startX = e.clientX;
            const startW = sidebar.getBoundingClientRect().width;
            const minW = 200;
            const maxW = Math.min(560, Math.floor(window.innerWidth * 0.55));

            const onMove = (ev) => {
                let newW = startW + (ev.clientX - startX);
                newW = Math.max(minW, Math.min(maxW, newW));
                sidebar.style.width = `${newW}px`;
            };
            const onUp = (ev) => {
                resizer.classList.remove('is-dragging');
                resizer.releasePointerCapture?.(ev.pointerId);
                resizer.removeEventListener('pointermove', onMove);
                resizer.removeEventListener('pointerup', onUp);
                resizer.removeEventListener('pointercancel', onUp);
                try {
                    localStorage.setItem(
                        'ck-sidebar-width',
                        String(Math.round(sidebar.getBoundingClientRect().width))
                    );
                } catch (_) { /* ignore */ }
            };
            resizer.addEventListener('pointermove', onMove);
            resizer.addEventListener('pointerup', onUp);
            resizer.addEventListener('pointercancel', onUp);
        });
    }
    initSidebarWidthResizer();

    // Dark mode — must target #btn-dark-mode (NOT first .title-bar button = hamburger)
    function applyDarkMode(on) {
        document.documentElement.classList.toggle('dark', on);
        const btn = document.getElementById('btn-dark-mode');
        if (btn) {
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.title = on ? 'Switch to light mode' : 'Toggle vaporwave dark mode';
        }
        try { localStorage.setItem('ck-dark', on ? '1' : '0'); } catch (_) { /* ignore */ }
    }
    try {
        if (localStorage.getItem('ck-dark') === '1') applyDarkMode(true);
    } catch (_) { /* ignore */ }
    document.getElementById('btn-dark-mode')?.addEventListener('click', () => {
        applyDarkMode(!document.documentElement.classList.contains('dark'));
    });

    // Export button
    mountExportMenu();
    if (window.ckDesktop?.onToolCall) {
        window.ckDesktop.onToolCall(async (msg) => {
            try {
                if (window.ckFlush) await window.ckFlush();
                const result = await runToolCall(msg.name, msg.arguments || {});
                window.dispatchEvent(new Event('ck-reload-notebook'));
                window.ckDesktop.submitToolResult({ id: msg.id, ok: true, result });
            } catch (err) {
                window.ckDesktop.submitToolResult({ id: msg.id, ok: false, error: err.message || 'The tool failed.' });
            }
        });
    }

    mountShellViews({ flush: flushUnsaved });
    window.ckNotebookState = () => ({
        notebookId: state.currentNotebookId,
        sectionId: state.currentSectionId,
        pageId: state.currentPageId,
        view: document.body.dataset.shellView || 'notebook',
    });
    mountAssistant();
}

// ── Export ──────────────────────────────────────────────────────────────────

function downloadBlob(bytes, filename, type) {
    const blob = new Blob([bytes], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

async function ragInput(scope) {
    if (window.ckFlush) await window.ckFlush();
    const notebook = state.notebooks.find((item) => item.id === state.currentNotebookId);
    if (!notebook) return null;
    let sections = await getSections(notebook.id);
    if (scope !== 'notebook') {
        sections = sections.filter((section) => section.id === state.currentSectionId);
    }
    const packed = [];
    for (const section of sections) {
        let pages = await getPages(section.id);
        if (scope === 'page') {
            pages = pages.filter((page) => page.id === state.currentPageId || (page.subpages || []).some((sub) => sub.id === state.currentPageId));
            pages = pages.map((page) => {
                if (page.id === state.currentPageId) return { ...page, subpages: [] };
                return { ...page, subpages: (page.subpages || []).filter((sub) => sub.id === state.currentPageId) };
            });
        }
        packed.push({ title: section.title, pages });
    }
    return { notebookTitle: notebook.title || 'Notebook', sections: packed };
}

async function exportRag(scope) {
    const input = await ragInput(scope);
    if (!input) return;
    const files = buildRagFiles(input);
    downloadBlob(buildZip(files), ragZipName(input.notebookTitle), 'application/zip');
}

async function exportNotebook() {
    const input = await ragInput('notebook');
    if (!input) return;
    const markdown = buildSingleMarkdown(input);
    downloadBlob(new TextEncoder().encode(markdown), `${input.notebookTitle.replace(/[^\w.-]+/g, '_')}.md`, 'text/markdown');
}

function mountExportMenu() {
    const btn = document.getElementById('btn-export');
    if (!btn || document.getElementById('export-menu')) return;
    const wrap = document.createElement('div');
    wrap.className = 'view-menu-wrap';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const menu = document.createElement('div');
    menu.id = 'export-menu';
    menu.className = 'view-menu hidden';
    menu.setAttribute('role', 'menu');
    const items = [
        ['page', 'This page for RAG'],
        ['section', 'This chapter for RAG'],
        ['notebook', 'This notebook for RAG'],
        ['markdown', 'Notebook as one Markdown file'],
    ];
    for (const [id, label] of items) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'view-menu-item';
        item.textContent = label;
        item.addEventListener('click', () => {
            menu.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            if (id === 'markdown') exportNotebook();
            else exportRag(id);
        });
        menu.appendChild(item);
    }
    wrap.appendChild(menu);
    btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (event) => {
        if (!wrap.contains(event.target)) {
            menu.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
