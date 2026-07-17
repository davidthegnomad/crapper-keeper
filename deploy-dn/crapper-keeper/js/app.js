/**
 * Crapper Keeper — App Shell
 * Client-side rendering + event handling. Replaces all Jinja2 templates.
 */

import {
    getNotebooks, createNotebook,
    getSections, createSection,
    getSectionGroups,
    getPages, getPage, createPage, savePage, deletePage, movePage,
    searchPages, uploadImage, seedIfEmpty,
    initAuth, signInWithGoogle, signOutUser, getCurrentUser
} from './firebase-db.js';

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

// ── Render Functions ────────────────────────────────────────────────────────

function renderNotebookTabs() {
    const container = document.querySelector('.tk-tabs-container');
    if (!state.notebooks.length) {
        container.innerHTML = `<div class="tk-tabs-container" style="padding:12px;font-size:11px;color:var(--text-tertiary);text-align:center;">
            <input type="text" id="seed-notebook" placeholder="First notebook..." autofocus
                   style="width:100%;padding:4px 8px;border:1px solid var(--border-default);border-radius:4px;font-size:11px;outline:none;">
        </div>`;
        return;
    }
    container.innerHTML = state.notebooks.map((nb, i) => `
        <a href="#" class="tk-tab tk-tab-${i+1} ${nb.id === state.currentNotebookId ? 'tk-tab-active' : ''}"
           style="--tab-color:${nb.color||'#80397b'};--tab-index:${i+1}"
           data-nb-id="${nb.id}" title="${nb.title}">
            <span class="tk-tab-label">${nb.title}</span>
        </a>
    `).join('') + `
        <form id="add-nb-form" style="position:absolute;top:${state.notebooks.length*88+16}px;left:0;">
            <button type="submit" class="tk-tab tk-tab-add"
                    style="position:static;font-size:16px;padding-left:10px;min-width:30px;" title="New notebook">+</button>
        </form>`;
}

function renderSections() {
    const container = document.getElementById('section-list');
    const addForm = document.getElementById('section-add-form');
    if (!state.currentNotebookId || !state.sections.length) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">Select a notebook</div>`;
        if (addForm) addForm.innerHTML = '';
        return;
    }

    let html = '';
    // Section Groups
    if (state.groups.length) {
        for (const sg of state.groups) {
            const groupSections = state.sections.filter(s => s.sectionGroupId === sg.id);
            html += `<div>
                <div class="section-group-header"
                     _="on click toggle .hidden on next <div/>
                        if my firstChild.innerText == '▸' then set my firstChild.innerText to '▾' else set my firstChild.innerText to '▸' end">
                    <span>▸</span><span>${sg.title}</span>
                </div>
                <div class="hidden">
                    ${groupSections.map(s => renderSectionItem(s)).join('')}
                </div>
            </div>`;
        }
    }

    // Top-level sections
    const topSections = state.sections.filter(s => !s.sectionGroupId);
    html += topSections.map(s => renderSectionItem(s)).join('');

    container.innerHTML = html;

    if (addForm && state.currentNotebookId) {
        addForm.innerHTML = `<input type="text" id="input-new-section" placeholder="+ Chapter"
            style="width:calc(100% - 16px);margin:4px 8px;padding:5px 10px;border:1px solid var(--border-default);border-radius:6px;background:var(--surface-white);font-size:11px;outline:none;">`;
    }
}

function renderSectionItem(s) {
    return `<div class="section-item-row" data-section-id="${s.id}">
        <span class="drag-handle section-drag-handle">⋮⋮</span>
        <a href="#" class="section-item flex-1 ${s.id === state.currentSectionId ? 'active' : ''}"
           style="border-left-color:${s.color||'#5B9BD5'}" data-section-id="${s.id}">
            ${s.title}
        </a>
    </div>`;
}

function renderPages() {
    const container = document.getElementById('page-list');
    const addForm = document.getElementById('page-add-form');
    if (!state.currentSectionId || !state.pages.length) {
        container.innerHTML = `<div style="padding:6px 12px;font-size:11px;color:var(--text-tertiary);font-style:italic;">Select a chapter</div>`;
        if (addForm) addForm.innerHTML = '';
        return;
    }

    let html = '';
    for (const p of state.pages) {
        html += `<div data-page-id="${p.id}">
            <div class="page-item-row">
                <span class="drag-handle">⋮⋮</span>
                ${p.subpages?.length ? `<span class="page-collapse-btn"
                    _="on click halt the event then toggle .hidden on the next <div/> then
                       if my innerText == '▸' set my innerText to '▾' else set my innerText to '▸' end">▸</span>` : `<span style="width:18px;"></span>`}
                <a href="#" class="page-item ${p.id === state.currentPageId ? 'active' : ''}"
                   data-page-id="${p.id}">${p.title}</a>
            </div>`;
        if (p.subpages?.length) {
            html += `<div class="hidden">`;
            for (const sub of p.subpages) {
                html += `<div data-page-id="${sub.id}">
                    <div class="page-item-row">
                        <span class="drag-handle">⋮⋮</span>
                        <span style="width:18px;"></span>
                        <a href="#" class="page-item subpage ${sub.id === state.currentPageId ? 'active' : ''}"
                           data-page-id="${sub.id}">${sub.title}</a>
                    </div></div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
    }
    container.innerHTML = html;

    if (addForm && state.currentSectionId) {
        addForm.innerHTML = `<input type="text" id="input-new-page" placeholder="+ Page"
            style="width:calc(100% - 16px);margin:4px 8px;padding:5px 10px;border:1px solid var(--border-default);border-radius:6px;background:var(--surface-white);font-size:11px;outline:none;">`;
    }
}

async function renderEditor() {
    const container = document.getElementById('editor-pane');
    if (!state.currentPageId) {
        container.innerHTML = `<div class="empty-state"><div class="empty-inner">
            <h2>Welcome to Crapper Keeper</h2>
            <p>Select a page from the sidebar to get started.</p>
        </div></div>`;
        return;
    }

    const page = await getPage(state.currentPageId);
    state.currentPage = page;
    if (!page) return;

    const section = state.sections.find(s => s.id === page.sectionId);
    const sectionColor = section?.color || '#5B9BD5';

    container.innerHTML = `
        <div class="editor-container">
            <script id="page-content-json" type="application/json">${page.contentJson || '{}'}</script>
            <h1 id="page-title" class="page-title" contenteditable="true">${page.title || 'Untitled Page'}</h1>
            <div class="page-accent" style="background:${sectionColor}"></div>
            <div id="editor-toolbar" class="editor-toolbar">
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
                <button class="toolbar-btn" id="btn-upload-image">🖼</button>
            </div>
            <div class="editor-body">
                <div id="editor-content" data-page-id="${state.currentPageId}"></div>
            </div>
            <input type="file" id="image-upload-input" accept="image/*" class="hidden">
        </div>`;

    // Update breadcrumb
    const nb = state.notebooks.find(n => n.id === state.currentNotebookId);
    document.getElementById('breadcrumb').textContent =
        `${nb?.title || ''} › ${section?.title || ''} › ${page.title || ''}`;

    // Re-init TipTap
    if (typeof initEditor === 'function') {
        setTimeout(() => initEditor(state.currentPageId), 100);
    }

    // Toolbar events
    setupToolbar();
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

async function selectNotebook(nbId) {
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
    state.currentSectionId = sectionId;
    state.currentPageId = null;
    state.pages = await getPages(sectionId);
    renderSections();
    renderPages();
    await renderEditor();
}

async function selectPage(pageId) {
    state.currentPageId = pageId;
    await renderEditor();
}

async function handleAddNotebook(e) {
    e.preventDefault();
    const input = document.querySelector('.tk-tabs-container input');
    if (!input?.value.trim()) return;
    await createNotebook(input.value.trim());
    await refreshAll();
}

async function handleAddSection(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val || !state.currentNotebookId) return;
    await createSection(state.currentNotebookId, val);
    e.target.value = '';
    state.sections = await getSections(state.currentNotebookId);
    renderSections();
}

async function handleAddPage(e) {
    if (e.key !== 'Enter') return;
    const val = e.target.value.trim();
    if (!val || !state.currentSectionId) return;
    await createPage(state.currentSectionId, val);
    e.target.value = '';
    state.pages = await getPages(state.currentSectionId);
    renderPages();
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
            const plain = (r.contentPlain || '').substring(0, 120);
            return `<a href="#" class="search-result-item" data-page-id="${r.id}">
                <div class="search-result-title">${r.title || 'Untitled'}</div>
                <div class="search-result-snippet">${plain}</div>
            </a>`;
        }).join('');
    }
    container.classList.remove('hidden');
}

// ── Auto-save bridge (called by editor.js) ──────────────────────────────────

window.onEditorUpdate = function(editor) {
    // autosave.js handles debounce, calls saveToServer
};

window.saveToServer = async function(editor) {
    if (!state.currentPageId) return;
    const json = JSON.stringify(editor.getJSON());
    const plain = editor.getText();
    await savePage(state.currentPageId, { contentJson: json, contentPlain: plain });
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
        if (btn) btn.disabled = true;
        try {
            await signInWithGoogle();
        } catch (e) {
            console.error(e);
            showAuthError('Sign-in failed: ' + (e.message || e.toString()));
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Event delegation
    document.querySelector('.tk-strip').addEventListener('click', async (e) => {
        const tab = e.target.closest('[data-nb-id]');
        if (tab) await selectNotebook(tab.dataset.nbId);
    });
    document.getElementById('add-nb-form')?.addEventListener('submit', handleAddNotebook);

    document.getElementById('section-list').addEventListener('click', async (e) => {
        const item = e.target.closest('[data-section-id]');
        if (item) await selectSection(item.dataset.sectionId);
    });
    document.addEventListener('keydown', (e) => {
        if (e.target.id === 'input-new-section' && e.key === 'Enter') handleAddSection(e);
    });

    document.getElementById('page-list').addEventListener('click', async (e) => {
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
        const section = state.sections.find(s => s.id === state.currentSectionId);
        // Find which section the page belongs to
        const page = await getPage(item.dataset.pageId);
        if (page) {
            // Switch to that section first
            await selectNotebook(state.currentNotebookId);
            state.currentSectionId = page.sectionId;
            state.pages = await getPages(page.sectionId);
            renderSections();
            renderPages();
            state.currentPageId = item.dataset.pageId;
            await renderEditor();
        }
        document.getElementById('search-results').classList.add('hidden');
    });

    // Dark mode
    document.querySelector('.title-bar button')?.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
    });

    // Export button
    document.getElementById('btn-export')?.addEventListener('click', exportNotebook);
}

// ── Auto-save override ──────────────────────────────────────────────────────

// Override the editor.js saveToServer to use Firestore
const origSave = window.saveToServer || (async () => {});
window.saveToServer = async function(editor) {
    if (!state.currentPageId) return;
    const json = JSON.stringify(editor.getJSON());
    const plain = editor.getText();
    await savePage(state.currentPageId, { contentJson: json, contentPlain: plain });
};

// ── Export ──────────────────────────────────────────────────────────────────

function jsonToMd(obj) {
    if (!obj || !obj.content) return '';
    return obj.content.map(node => {
        if (node.type === 'paragraph') {
            const text = (node.content || []).map(n => n.text || '').join('');
            const marks = node.content?.[0]?.marks || [];
            let formatted = text;
            for (const m of marks) {
                if (m.type === 'bold') formatted = `**${formatted}**`;
                if (m.type === 'italic') formatted = `*${formatted}*`;
                if (m.type === 'code') formatted = `\`${formatted}\``;
                if (m.type === 'link') formatted = `[${formatted}](${m.attrs?.href || ''})`;
            }
            return formatted + '\n';
        }
        if (node.type === 'heading') {
            const level = node.attrs?.level || 1;
            const text = (node.content || []).map(n => n.text || '').join('');
            return '#'.repeat(level) + ' ' + text + '\n';
        }
        if (node.type === 'bulletList') {
            return (node.content || []).map(li => {
                const text = (li.content?.[0]?.content || []).map(n => n.text || '').join('');
                return '- ' + text + '\n';
            }).join('');
        }
        if (node.type === 'orderedList') {
            return (node.content || []).map((li, i) => {
                const text = (li.content?.[0]?.content || []).map(n => n.text || '').join('');
                return `${i+1}. ${text}\n`;
            }).join('');
        }
        if (node.type === 'taskList') {
            return (node.content || []).map(li => {
                const checked = li.attrs?.checked ? 'x' : ' ';
                const text = (li.content?.[0]?.content || []).map(n => n.text || '').join('');
                return `- [${checked}] ${text}\n`;
            }).join('');
        }
        if (node.type === 'blockquote') {
            const inner = jsonToMd({ content: node.content || [] });
            return inner.split('\n').filter(l => l).map(l => '> ' + l).join('\n') + '\n';
        }
        if (node.type === 'codeBlock') {
            const lang = node.attrs?.language || '';
            const text = (node.content || []).map(n => n.text || '').join('');
            return '```' + lang + '\n' + text + '\n```\n';
        }
        if (node.type === 'horizontalRule') return '---\n';
        if (node.type === 'image') {
            return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n`;
        }
        return '';
    }).join('') + '\n';
}

async function exportNotebook() {
    if (!state.currentNotebookId) return;
    const nb = state.notebooks.find(n => n.id === state.currentNotebookId);
    if (!nb) return;

    const sections = await getSections(state.currentNotebookId);
    let md = `# ${nb.title}\n\n`;

    // Also get sections in groups
    const groups = await getSectionGroups(state.currentNotebookId);
    for (const sg of groups) {
        const gs = await getSections(state.currentNotebookId, sg.id);
        sections.push(...gs);
    }

    for (const section of sections) {
        md += `## ${section.title}\n\n`;
        const pages = await getPages(section.id);
        for (const page of pages) {
            md += `### ${page.title}\n\n`;
            try {
                const json = JSON.parse(page.contentJson || '{}');
                md += jsonToMd(json);
            } catch (e) {
                md += page.contentPlain || '';
            }
            md += '\n---\n\n';

            // Subpages
            if (page.subpages) {
                for (const sub of page.subpages) {
                    md += `#### ${sub.title}\n\n`;
                    try {
                        const sj = JSON.parse(sub.contentJson || '{}');
                        md += jsonToMd(sj);
                    } catch (e) {
                        md += sub.contentPlain || '';
                    }
                    md += '\n';
                }
            }
        }
    }

    // Download
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nb.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
