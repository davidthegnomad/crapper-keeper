/**
 * Crapper Keeper — TipTap Rich Text Editor
 * Bundled locally by Vite for web, iOS, and Android.
 */

import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

let currentEditor = null;
let currentPageId = null;

// ── TipTap initialization ────────────────────────────────────────────────────

function resolveTipTapContent(raw) {
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return '';
    const s = raw.trim();
    if (!s) return '';
    if (s.startsWith('{')) {
        try {
            const parsed = JSON.parse(s);
            if (parsed && parsed.type === 'doc') return parsed;
        } catch (e) {
            console.warn('Failed to parse page content JSON, using as HTML');
            return s;
        }
    }
    return s;
}

async function initEditor(pageId, rawContent) {
    if (currentEditor) {
        currentEditor.destroy();
        currentEditor = null;
    }

    currentPageId = pageId;
    const container = document.getElementById('editor-content');
    if (!container) return;

    let content = rawContent;
    if (content == null) {
        const meta = document.getElementById('page-content-json');
        if (meta && meta.textContent.trim()) content = meta.textContent;
    }
    content = resolveTipTapContent(content);

    currentEditor = new Editor({
        element: container,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            Link.configure({ openOnClick: false }),
            Image.configure({ inline: true }),
            Highlight,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Table.configure({ resizable: true }),
            TableRow,
            TableCell,
            TableHeader,
            TaskList,
            TaskItem.configure({ nested: true }),
        ],
        content: content || '',
        editable: true,
        autofocus: 'end',
        onUpdate: () => {
            if (typeof window.onEditorUpdate === 'function') {
                window.onEditorUpdate(currentEditor);
            }
        },
    });

    window.currentEditor = currentEditor;
}

function destroyEditor() {
    if (currentEditor) {
        currentEditor.destroy();
        currentEditor = null;
        currentPageId = null;
    }
    window.currentEditor = null;
}

// ── Refresh page content from server into hidden meta ───────────────────────

function loadPageContent() {
    const meta = document.getElementById('page-content-json');
    if (meta && meta.textContent.trim()) {
        try {
            return JSON.parse(meta.textContent);
        } catch (e) {}
    }
    return null;
}

// ── Initialization on page load ──────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const editorContainer = document.getElementById('editor-content');
    if (editorContainer && editorContainer.dataset.pageId) {
        initEditor(parseInt(editorContainer.dataset.pageId));
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (typeof window.saveToServer === 'function') {
                window.saveToServer(currentEditor);
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            const searchInput = document.querySelector('.search-input');
            if (searchInput) searchInput.focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            const form = document.querySelector('#input-new-section');
            if (form) form.focus();
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            const form = document.querySelector('#input-new-page');
            if (form) form.focus();
        }
    });
});

window.initEditor = initEditor;
window.destroyEditor = destroyEditor;
