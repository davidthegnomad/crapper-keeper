/**
 * Runs one local tool call against the signed-in notebook.
 * Vault tools never reach this file.
 */

import {
    getNotebooks, createNotebook, deleteNotebook, renameNotebook, getNotebook,
    getSections, createSection, deleteSection, renameSection,
    getPages, getPage, createPage, savePage, deletePage,
} from './firebase-db.js';
import { buildRagFiles, pageBody } from './rag-export.js';
import guard from '../../../desktop/tool-guard.cjs';

const { checkToolCall } = guard;

function clip(value, max) {
    return String(value || '').slice(0, max);
}

function snippet(page) {
    return pageBody(page).replace(/\s+/g, ' ').slice(0, 140);
}

function pageFields(body, title, pageMode) {
    const text = String(body || '');
    const mode = pageMode === 'markdown' || pageMode === 'html' || pageMode === 'rich'
        ? pageMode
        : (/<[a-z][\s\S]*>/i.test(text) ? 'html' : 'rich');
    const plain = mode === 'html'
        ? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : text;
    const fields = {
        contentPlain: plain.slice(0, 20000),
        contentSource: text.slice(0, 20000),
        pageMode: mode,
    };
    if (title) fields.title = clip(title, 200);
    return fields;
}

async function sectionsOf(notebookId) {
    const sections = await getSections(notebookId);
    const out = [];
    for (const section of sections) {
        out.push({ title: section.title, pages: await getPages(section.id) });
    }
    return out;
}

export async function runToolCall(name, args = {}) {
    const check = checkToolCall(name, args);
    if (!check.ok) throw new Error(check.error);
    if (name === 'list_notebooks') {
        const notebooks = await getNotebooks();
        return notebooks.slice(0, 40).map((notebook) => ({ id: notebook.id, title: notebook.title || '' }));
    }
    if (name === 'create_notebook') {
        const title = clip(args.title, 200).trim();
        if (!title) throw new Error('A notebook needs a name.');
        const id = await createNotebook(title);
        return { id, title };
    }
    if (name === 'rename_notebook') {
        const title = clip(args.title, 200).trim();
        if (!title) throw new Error('A notebook needs a name.');
        await renameNotebook(args.id, title);
        return { id: args.id, title };
    }
    if (name === 'delete_notebook') {
        await deleteNotebook(args.id);
        return { deleted: args.id };
    }
    if (name === 'list_sections') {
        const sections = await getSections(args.notebookId);
        return sections.slice(0, 40).map((section) => ({ id: section.id, title: section.title || '' }));
    }
    if (name === 'create_section') {
        const title = clip(args.title, 200).trim();
        if (!title) throw new Error('A chapter needs a name.');
        const id = await createSection(args.notebookId, title);
        return { id, title };
    }
    if (name === 'rename_section') {
        const title = clip(args.title, 200).trim();
        if (!title) throw new Error('A chapter needs a name.');
        await renameSection(args.id, title);
        return { id: args.id, title };
    }
    if (name === 'delete_section') {
        await deleteSection(args.id);
        return { deleted: args.id };
    }
    if (name === 'list_pages') {
        const pages = await getPages(args.sectionId);
        const flat = pages.flatMap((page) => [page, ...(page.subpages || [])]);
        return flat.slice(0, 40).map((page) => ({ id: page.id, title: page.title || '', snippet: snippet(page) }));
    }
    if (name === 'read_page') {
        const page = await getPage(args.id);
        if (!page) throw new Error('Page not found.');
        return {
            id: page.id,
            title: page.title || '',
            sectionId: page.sectionId,
            text: pageBody(page).slice(0, 8000),
        };
    }
    if (name === 'create_page') {
        const title = clip(args.title, 200).trim() || 'Untitled';
        const id = await createPage(args.sectionId, title);
        if (args.body != null) await savePage(id, pageFields(args.body, title, args.pageMode));
        return { id, title };
    }
    if (name === 'update_page') {
        const page = await getPage(args.id);
        if (!page) throw new Error('Page not found.');
        const fields = pageFields(args.body != null ? args.body : pageBody(page), args.title, args.pageMode);
        if (args.title == null) delete fields.title;
        if (args.body == null && args.pageMode == null) {
            delete fields.contentPlain;
            delete fields.contentSource;
            delete fields.pageMode;
        }
        await savePage(page.id, fields);
        return { id: page.id, title: args.title || page.title || '' };
    }
    if (name === 'delete_page') {
        const page = await getPage(args.id);
        if (!page) throw new Error('Page not found.');
        await deletePage(page.id);
        return { deleted: page.id };
    }
    if (name === 'export_rag') {
        const notebook = await getNotebook(args.notebookId);
        if (!notebook) throw new Error('Notebook not found.');
        const sections = await sectionsOf(notebook.id);
        const files = buildRagFiles({
            notebookTitle: notebook.title || 'Notebook',
            sections: sections.map((section) => ({
                title: section.title,
                pages: section.pages,
            })),
        }).filter((file) => file.path !== 'README.md');
        return {
            notebookId: notebook.id,
            files: files.slice(0, 200).map((file) => ({
                path: file.path,
                markdown: file.markdown.slice(0, 100000),
            })),
        };
    }
    throw new Error('That tool is not on this API.');
}
