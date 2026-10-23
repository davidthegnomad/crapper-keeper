/**
 * Applies the assistant's action list to the signed-in notebook and the
 * built-in Slate, Preview, and sticky notes. Unknown actions are ignored.
 */

import {
    createNotebook, deleteNotebook, renameNotebook, getNotebook,
    getSections, getSection, createSection, deleteSection, renameSection,
    getPages, getPage, createPage, savePage, deletePage,
} from './firebase-db.js';

import { createVaultSecret, deleteVaultSecret, updateVaultSecret, vaultIsUnlocked } from './vault-session.js';

const VIEWS = new Set(['notebook', 'slate', 'preview', 'stickies', 'vault']);

function clip(value, max) {
    return String(value || '').slice(0, max);
}

function cleanId(value) {
    const id = clip(value, 128).trim();
    if (!id || /[\\/]/.test(id)) return '';
    return id;
}

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : fallback;
    } catch {
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function plainToDoc(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    return JSON.stringify({
        type: 'doc',
        content: lines.map((line) => (
            line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }
        )),
    });
}

function pageFields(body, title) {
    const text = String(body || '');
    const html = /<[a-z][\s\S]*>/i.test(text);
    const plain = html ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : text;
    const fields = {
        contentPlain: plain,
        contentSource: text,
        contentJson: plainToDoc(plain),
    };
    if (html) fields.pageMode = 'html';
    if (title) fields.title = clip(title, 200);
    return fields;
}

function newId(prefix) {
    return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function here() {
    try {
        return window.ckNotebookState ? window.ckNotebookState() : {};
    } catch {
        return {};
    }
}

async function notebookId(requested, last) {
    const id = cleanId(requested) || last || here().notebookId || '';
    if (!id) return '';
    const found = await getNotebook(id);
    return found ? found.id : '';
}

async function sectionId(requested, last) {
    const id = cleanId(requested) || last || here().sectionId || '';
    if (!id) return null;
    const found = await getSection(id);
    return found || null;
}

export async function executeTools(tools) {
    const lines = [];
    let open = null;
    let view = '';
    let reloadNotebook = false;
    let reloadTools = false;
    let lastNotebook = here().notebookId || '';
    let lastSection = here().sectionId || '';

    for (const tool of tools || []) {
        const args = tool.args || {};
        try {
            if (tool.name === 'switch_view') {
                if (!VIEWS.has(args.view)) throw new Error('Unknown view.');
                view = args.view;
                lines.push(`Opened ${args.view}.`);
                continue;
            }
            if (tool.name === 'open_page') {
                let id = cleanId(args.id);
                if (!id && args.title && lastSection) {
                    const pages = await getPages(lastSection);
                    const flat = pages.flatMap((page) => [page, ...(page.subpages || [])]);
                    const hit = flat.find((page) => String(page.title || '').toLowerCase() === args.title.toLowerCase());
                    if (hit) id = hit.id;
                }
                const page = id ? await getPage(id) : null;
                if (!page) throw new Error('Page not found.');
                const section = await getSection(page.sectionId);
                open = { notebookId: section ? section.notebookId : lastNotebook, sectionId: page.sectionId, pageId: page.id };
                view = 'notebook';
                lines.push(`Opened “${page.title || 'page'}”.`);
                continue;
            }
            if (tool.name === 'create_notebook') {
                const title = clip(args.title, 200).trim() || 'Untitled';
                lastNotebook = await createNotebook(title);
                lastSection = '';
                reloadNotebook = true;
                lines.push(`Created notebook “${title}”.`);
                continue;
            }
            if (tool.name === 'rename_notebook') {
                const id = await notebookId(args.id, '');
                if (!id) throw new Error('Notebook not found.');
                const title = clip(args.title, 200).trim();
                if (!title) throw new Error('A notebook needs a name.');
                await renameNotebook(id, title);
                reloadNotebook = true;
                lines.push(`Renamed notebook to “${title}”.`);
                continue;
            }
            if (tool.name === 'delete_notebook') {
                const id = await notebookId(args.id, '');
                if (!id) throw new Error('Notebook not found.');
                await deleteNotebook(id);
                if (id === lastNotebook) lastNotebook = '';
                reloadNotebook = true;
                lines.push('Deleted notebook.');
                continue;
            }
            if (tool.name === 'create_section') {
                const nb = await notebookId(args.notebookId, lastNotebook);
                if (!nb) throw new Error('Open or name a notebook first.');
                const title = clip(args.title, 200).trim() || 'Untitled';
                lastSection = await createSection(nb, title);
                lastNotebook = nb;
                reloadNotebook = true;
                lines.push(`Created chapter “${title}”.`);
                continue;
            }
            if (tool.name === 'rename_section') {
                const section = await sectionId(args.id, '');
                if (!section) throw new Error('Chapter not found.');
                const title = clip(args.title, 200).trim();
                if (!title) throw new Error('A chapter needs a name.');
                await renameSection(section.id, title);
                reloadNotebook = true;
                lines.push(`Renamed chapter to “${title}”.`);
                continue;
            }
            if (tool.name === 'delete_section') {
                const section = await sectionId(args.id, '');
                if (!section) throw new Error('Chapter not found.');
                await deleteSection(section.id);
                reloadNotebook = true;
                lines.push('Deleted chapter.');
                continue;
            }
            if (tool.name === 'create_page' || tool.name === 'update_page') {
                const title = clip(args.title, 200).trim();
                const body = args.body != null ? String(args.body) : '';
                if (tool.name === 'create_page') {
                    const section = await sectionId(args.sectionId, lastSection);
                    if (!section) throw new Error('Open a chapter first.');
                    const pageTitle = title || 'Untitled';
                    const pageId = await createPage(section.id, pageTitle);
                    const fields = pageFields(body, pageTitle);
                    if (args.pageMode === 'markdown' || args.pageMode === 'html' || args.pageMode === 'rich') {
                        fields.pageMode = args.pageMode;
                    }
                    if (body || fields.pageMode) await savePage(pageId, fields);
                    lastSection = section.id;
                    open = { notebookId: section.notebookId, sectionId: section.id, pageId };
                    view = 'notebook';
                    reloadNotebook = true;
                    lines.push(`Created page “${pageTitle}”.`);
                } else {
                    const id = cleanId(args.id) || here().pageId || '';
                    const page = id ? await getPage(id) : null;
                    if (!page) throw new Error('Page not found.');
                    if (!title && args.body == null) throw new Error('Nothing to change on that page.');
                    const fields = pageFields(body, title);
                    if (!title) delete fields.title;
                    if (args.body == null) {
                        delete fields.contentPlain;
                        delete fields.contentSource;
                        delete fields.contentJson;
                        delete fields.pageMode;
                    }
                    await savePage(page.id, fields);
                    const section = await getSection(page.sectionId);
                    open = { notebookId: section ? section.notebookId : lastNotebook, sectionId: page.sectionId, pageId: page.id };
                    view = 'notebook';
                    reloadNotebook = true;
                    lines.push(`Updated “${title || page.title || 'page'}”.`);
                }
                continue;
            }
            if (tool.name === 'delete_page') {
                let id = cleanId(args.id);
                if (!id && args.title && lastSection) {
                    const pages = await getPages(lastSection);
                    const flat = pages.flatMap((page) => [page, ...(page.subpages || [])]);
                    const hit = flat.find((page) => String(page.title || '').toLowerCase() === args.title.toLowerCase());
                    if (hit) id = hit.id;
                }
                if (!id) id = here().pageId || '';
                const page = id ? await getPage(id) : null;
                if (!page) throw new Error('Page not found.');
                await deletePage(page.id);
                reloadNotebook = true;
                lines.push(`Deleted “${page.title || 'page'}”.`);
                continue;
            }
            if (tool.name === 'create_slate' || tool.name === 'update_slate' || tool.name === 'delete_slate') {
                const data = readJson('ck-slate', { activeId: '', notes: [] });
                if (!Array.isArray(data.notes)) data.notes = [];
                if (tool.name === 'create_slate') {
                    const note = {
                        id: newId('s'),
                        title: clip(args.title, 200).trim() || 'Untitled',
                        body: String(args.body || ''),
                    };
                    data.notes.unshift(note);
                    data.activeId = note.id;
                    lines.push(`Created scratch “${note.title}”.`);
                } else {
                    const note = data.notes.find((item) => item.id === cleanId(args.id))
                        || data.notes.find((item) => args.title && String(item.title || '').toLowerCase() === args.title.toLowerCase());
                    if (!note) throw new Error('Scratch note not found.');
                    if (tool.name === 'delete_slate') {
                        data.notes = data.notes.filter((item) => item !== note);
                        if (data.activeId === note.id) data.activeId = data.notes[0] ? data.notes[0].id : '';
                        lines.push(`Deleted scratch “${note.title || 'note'}”.`);
                    } else {
                        if (args.title) note.title = clip(args.title, 200);
                        if (args.body != null) note.body = String(args.body);
                        data.activeId = note.id;
                        lines.push(`Updated scratch “${note.title || 'note'}”.`);
                    }
                }
                writeJson('ck-slate', data);
                reloadTools = true;
                view = 'slate';
                continue;
            }
            if (tool.name === 'set_preview') {
                const data = readJson('ck-preview-lab', { html: '', css: '', js: '', width: '100%' });
                if (args.html == null && args.css == null && args.js == null) throw new Error('Nothing to change in Preview.');
                if (args.html != null) data.html = String(args.html);
                if (args.css != null) data.css = String(args.css);
                if (args.js != null) data.js = String(args.js);
                writeJson('ck-preview-lab', data);
                reloadTools = true;
                view = 'preview';
                lines.push('Updated Preview.');
                continue;
            }
            if (tool.name === 'create_sticky' || tool.name === 'update_sticky' || tool.name === 'delete_sticky') {
                const data = readJson('ck-stickies', { notes: [] });
                if (!Array.isArray(data.notes)) data.notes = [];
                if (tool.name === 'create_sticky') {
                    data.notes.unshift({
                        id: newId('k'),
                        text: String(args.text || ''),
                        color: '#fff3bf',
                        x: 24 + (data.notes.length % 5) * 28,
                        y: 24 + (data.notes.length % 4) * 28,
                    });
                    lines.push('Added a sticky note.');
                } else {
                    const note = data.notes.find((item) => item.id === cleanId(args.id))
                        || data.notes.find((item) => args.text && String(item.text || '') === args.text);
                    if (!note) throw new Error('Sticky note not found.');
                    if (tool.name === 'delete_sticky') {
                        data.notes = data.notes.filter((item) => item !== note);
                        lines.push('Deleted sticky note.');
                    } else {
                        note.text = String(args.text || '');
                        lines.push('Updated sticky note.');
                    }
                }
                writeJson('ck-stickies', data);
                reloadTools = true;
                view = 'stickies';
                continue;
            }
            if (tool.name === 'create_secret' || tool.name === 'update_secret' || tool.name === 'delete_secret') {
                if (!vaultIsUnlocked()) throw new Error('Unlock the vault first.');
                if (tool.name === 'create_secret') {
                    await createVaultSecret(args);
                    lines.push('Saved a vault item.');
                } else if (tool.name === 'update_secret') {
                    await updateVaultSecret(args);
                    lines.push('Updated a vault item.');
                } else {
                    await deleteVaultSecret(args);
                    lines.push('Deleted a vault item.');
                }
                reloadTools = true;
                view = 'vault';
                continue;
            }
            lines.push('Skipped an unknown action.');
        } catch (err) {
            lines.push(err.message || 'That change did not save.');
        }
    }

    return {
        lines,
        open,
        view,
        reloadNotebook,
        reloadTools,
        changed: lines.some((line) => !/not found|did not|needs a name|Open a|Nothing to|Unknown|Skipped/.test(line)),
    };
}
