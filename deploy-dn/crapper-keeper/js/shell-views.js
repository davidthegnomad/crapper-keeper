/**
 * Built-in views for the other Gnomad apps.
 * Slate scratchpad, Webcanvas-style preview, and a sticky-note board
 * live in this window. They are not separate launches.
 */

import { renderMarkdownPreview } from './render-modes.js';
import { applyClip, assemblePreviewDoc, readOpenHash, SHELL_VIEWS } from './shell-view-data.js';
import { mountVaultPanel } from './vault-view.js';

const COLORS = ['#fff3bf', '#ffd6e0', '#d3f9d8', '#d0ebff', '#e5dbff'];

export { assemblePreviewDoc, SHELL_VIEWS };

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function defaultSlate() {
    return {
        activeId: 'scratch',
        notes: [{
            id: 'scratch',
            title: 'Scratch',
            body: '# Scratch\n\nDrop a thought here. **Markdown** previews on the right.',
        }],
    };
}

function defaultPreview() {
    return {
        html: '<main>\n  <h1>Preview</h1>\n  <p>Edit the panes. This frame updates as you type.</p>\n</main>\n',
        css: 'body { font-family: system-ui, sans-serif; padding: 24px; }\nh1 { color: #80397b; }\n',
        js: '',
        width: '100%',
    };
}

function defaultStickies() {
    return {
        notes: [
            { id: uid(), text: 'A short note you can drag.', color: COLORS[0], x: 24, y: 24 },
            { id: uid(), text: 'Another one.', color: COLORS[1], x: 230, y: 48 },
        ],
    };
}

function mountShellViews({ flush } = {}) {
    const menuBtn = document.getElementById('btn-view');
    const menu = document.getElementById('view-menu');
    const stage = document.getElementById('tool-stage');
    const crumb = document.getElementById('breadcrumb');
    if (!menuBtn || !menu || !stage) return;

    const panels = {};
    let current = 'notebook';
    let savedCrumb = crumb ? crumb.textContent : '';

    menu.replaceChildren();
    for (const view of SHELL_VIEWS) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'view-menu-item';
        item.role = 'menuitem';
        item.dataset.shellView = view.id;
        const name = document.createElement('span');
        name.textContent = view.label;
        const hint = document.createElement('small');
        hint.textContent = view.hint;
        item.append(name, hint);
        item.addEventListener('click', () => { setView(view.id); });
        menu.appendChild(item);
    }

    function closeMenu() {
        menu.classList.add('hidden');
        menuBtn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
        menu.classList.remove('hidden');
        menuBtn.setAttribute('aria-expanded', 'true');
    }

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu.classList.contains('hidden')) openMenu();
        else closeMenu();
    });
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && e.target !== menuBtn) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
    });

    function markActive() {
        menu.querySelectorAll('[data-shell-view]').forEach((btn) => {
            const on = btn.dataset.shellView === current;
            btn.classList.toggle('active', on);
            btn.setAttribute('aria-current', on ? 'true' : 'false');
        });
    }

    async function setView(id, { force = false } = {}) {
        if (!SHELL_VIEWS.some((view) => view.id === id)) id = 'notebook';
        closeMenu();
        if (id === current && !force) return;
        if (current === 'notebook' && id !== 'notebook' && crumb) savedCrumb = crumb.textContent;
        if (current === 'notebook' && flush) {
            try { await flush(); } catch { /* still switch */ }
        }
        current = id;
        writeJson('ck-shell-view', id);
        apply();
    }

    function apply() {
        const tool = current !== 'notebook';
        document.body.dataset.shellView = current;
        stage.hidden = !tool;
        Object.entries(panels).forEach(([id, el]) => { el.hidden = id !== current; });
        if (tool) ensurePanel(current);
        if (crumb) {
            const view = SHELL_VIEWS.find((item) => item.id === current);
            crumb.textContent = tool ? view.label : savedCrumb;
        }
        markActive();
    }

    function dropPanel(id) {
        if (!panels[id]) return;
        panels[id].remove();
        delete panels[id];
    }

    function ensurePanel(id) {
        if (panels[id]) return;
        const el = document.createElement('section');
        el.className = `shell-panel shell-panel-${id}`;
        el.dataset.panel = id;
        if (id === 'slate') buildSlate(el);
        if (id === 'preview') buildPreview(el);
        if (id === 'stickies') buildStickies(el);
        if (id === 'vault') mountVaultPanel(el);
        stage.appendChild(el);
        panels[id] = el;
    }

    function buildSlate(root) {
        const data = readJson('ck-slate', null) || defaultSlate();
        if (!Array.isArray(data.notes) || !data.notes.length) Object.assign(data, defaultSlate());
        root.innerHTML = `
            <aside class="slate-list-wrap">
                <button type="button" class="shell-add" data-add>New scratch</button>
                <div class="slate-list"></div>
            </aside>
            <div class="slate-editor">
                <input class="slate-title" type="text" aria-label="Scratch title">
                <textarea class="slate-body" aria-label="Scratch markdown" spellcheck="true"></textarea>
            </div>
            <div class="slate-preview" aria-label="Markdown preview"></div>`;
        const list = root.querySelector('.slate-list');
        const title = root.querySelector('.slate-title');
        const body = root.querySelector('.slate-body');
        const preview = root.querySelector('.slate-preview');
        let timer = null;
        const save = () => writeJson('ck-slate', data);
        const active = () => data.notes.find((note) => note.id === data.activeId) || data.notes[0];
        function renderList() {
            list.replaceChildren();
            for (const note of data.notes) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'slate-note' + (note.id === data.activeId ? ' active' : '');
                btn.textContent = note.title || 'Untitled';
                btn.addEventListener('click', () => {
                    data.activeId = note.id;
                    show();
                    save();
                });
                list.appendChild(btn);
            }
        }
        function show() {
            const note = active();
            data.activeId = note.id;
            title.value = note.title || '';
            body.value = note.body || '';
            preview.innerHTML = renderMarkdownPreview(note.body || '');
            renderList();
        }
        title.addEventListener('input', () => {
            active().title = title.value;
            renderList();
            clearTimeout(timer);
            timer = setTimeout(save, 300);
        });
        body.addEventListener('input', () => {
            active().body = body.value;
            preview.innerHTML = renderMarkdownPreview(body.value);
            clearTimeout(timer);
            timer = setTimeout(save, 300);
        });
        root.querySelector('[data-add]').addEventListener('click', () => {
            const note = { id: uid(), title: 'Untitled', body: '' };
            data.notes.unshift(note);
            data.activeId = note.id;
            show();
            save();
            title.focus();
        });
        show();
    }

    function buildPreview(root) {
        const data = { ...defaultPreview(), ...(readJson('ck-preview-lab', {}) || {}) };
        root.innerHTML = `
            <div class="preview-panes">
                <label>HTML<textarea class="preview-html" spellcheck="false"></textarea></label>
                <label>CSS<textarea class="preview-css" spellcheck="false"></textarea></label>
                <label>JS<textarea class="preview-js" spellcheck="false"></textarea></label>
            </div>
            <div class="preview-stage">
                <div class="preview-bar">
                    <span>Preview</span>
                    <button type="button" data-width="100%">Full</button>
                    <button type="button" data-width="768px">Tablet</button>
                    <button type="button" data-width="390px">Phone</button>
                </div>
                <iframe class="preview-frame" sandbox="allow-scripts" title="HTML preview"></iframe>
            </div>`;
        const html = root.querySelector('.preview-html');
        const css = root.querySelector('.preview-css');
        const js = root.querySelector('.preview-js');
        const frame = root.querySelector('.preview-frame');
        html.value = data.html;
        css.value = data.css;
        js.value = data.js;
        let timer = null;
        function paint() {
            frame.style.width = data.width || '100%';
            frame.srcdoc = assemblePreviewDoc(data);
            root.querySelectorAll('[data-width]').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.width === (data.width || '100%'));
            });
        }
        function onEdit() {
            data.html = html.value;
            data.css = css.value;
            data.js = js.value;
            paint();
            clearTimeout(timer);
            timer = setTimeout(() => writeJson('ck-preview-lab', data), 300);
        }
        html.addEventListener('input', onEdit);
        css.addEventListener('input', onEdit);
        js.addEventListener('input', onEdit);
        root.querySelectorAll('[data-width]').forEach((btn) => {
            btn.addEventListener('click', () => {
                data.width = btn.dataset.width;
                writeJson('ck-preview-lab', data);
                paint();
            });
        });
        paint();
    }

    function buildStickies(root) {
        const data = readJson('ck-stickies', null) || defaultStickies();
        if (!Array.isArray(data.notes)) data.notes = defaultStickies().notes;
        const bar = document.createElement('div');
        bar.className = 'sticky-toolbar';
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'shell-add';
        add.textContent = 'New note';
        bar.appendChild(add);
        const board = document.createElement('div');
        board.className = 'sticky-canvas';
        root.append(bar, board);
        let timer = null;
        const save = () => {
            clearTimeout(timer);
            timer = setTimeout(() => writeJson('ck-stickies', data), 200);
        };
        function render() {
            board.replaceChildren();
            data.notes.forEach((note) => {
                const card = document.createElement('article');
                card.className = 'sticky';
                card.style.left = `${note.x || 16}px`;
                card.style.top = `${note.y || 16}px`;
                card.style.background = note.color || COLORS[0];
                const drag = document.createElement('button');
                drag.type = 'button';
                drag.className = 'sticky-drag';
                drag.textContent = '⋮⋮';
                drag.title = 'Drag';
                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'sticky-del';
                del.textContent = '×';
                del.title = 'Delete note';
                const ta = document.createElement('textarea');
                ta.value = note.text || '';
                ta.addEventListener('input', () => {
                    note.text = ta.value;
                    save();
                });
                drag.addEventListener('pointerdown', (e) => {
                    if (e.button !== 0) return;
                    e.preventDefault();
                    drag.setPointerCapture(e.pointerId);
                    const ox = note.x || 16;
                    const oy = note.y || 16;
                    const sx = e.clientX;
                    const sy = e.clientY;
                    const move = (ev) => {
                        note.x = Math.max(8, ox + ev.clientX - sx);
                        note.y = Math.max(8, oy + ev.clientY - sy);
                        card.style.left = `${note.x}px`;
                        card.style.top = `${note.y}px`;
                    };
                    const up = () => {
                        drag.removeEventListener('pointermove', move);
                        drag.removeEventListener('pointerup', up);
                        save();
                    };
                    drag.addEventListener('pointermove', move);
                    drag.addEventListener('pointerup', up);
                });
                del.addEventListener('click', () => {
                    data.notes = data.notes.filter((item) => item !== note);
                    writeJson('ck-stickies', data);
                    render();
                });
                card.append(drag, del, ta);
                board.appendChild(card);
            });
        }
        add.addEventListener('click', () => {
            data.notes.push({
                id: uid(),
                text: '',
                color: COLORS[data.notes.length % COLORS.length],
                x: 24 + (data.notes.length % 5) * 28,
                y: 24 + (data.notes.length % 4) * 28,
            });
            writeJson('ck-stickies', data);
            render();
        });
        render();
    }

    function acceptLocationClip() {
        const clip = readOpenHash(location.hash);
        if (!clip) return false;
        const next = applyClip({
            slate: readJson('ck-slate', null),
            preview: readJson('ck-preview-lab', null),
            stickies: readJson('ck-stickies', null),
        }, clip);
        writeJson('ck-slate', next.slate);
        writeJson('ck-preview-lab', next.preview);
        writeJson('ck-stickies', next.stickies);
        if (panels[next.view]) {
            panels[next.view].remove();
            delete panels[next.view];
        }
        history.replaceState(null, '', location.pathname + location.search);
        current = current === next.view ? '' : current;
        setView(next.view, { force: true });
        return true;
    }

    if (!acceptLocationClip()) {
        const saved = readJson('ck-shell-view', 'notebook');
        current = SHELL_VIEWS.some((view) => view.id === saved) ? saved : 'notebook';
        apply();
    }
    window.addEventListener('hashchange', acceptLocationClip);
    window.addEventListener('ck-assistant-done', async (event) => {
        const detail = event.detail || {};
        if (detail.reloadTools) {
            dropPanel('slate');
            dropPanel('preview');
            dropPanel('stickies');
            dropPanel('vault');
        }
        if (detail.view) await setView(detail.view, { force: true });
        else if (detail.reloadTools) apply();
        if (detail.reloadNotebook || detail.open) {
            window.dispatchEvent(new CustomEvent('ck-notebook-sync', { detail }));
        }
    });
}

export { mountShellViews };
