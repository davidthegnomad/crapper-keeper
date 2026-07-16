/**
 * Crapper Keeper — TipTap Rich Text Editor
 * 
 * TipTap loads from esm.sh CDN via importmap in base.html.
 * No build step required — works directly in the browser.
 */

let currentEditor = null;
let currentPageId = null;

// ── TipTap initialization ────────────────────────────────────────────────────

async function initEditor(pageId) {
    if (currentEditor) {
        currentEditor.destroy();
        currentEditor = null;
    }

    currentPageId = pageId;
    const container = document.getElementById('editor-content');
    if (!container) return;

    // TipTap modules loaded via importmap in base.html
    const { Editor } = await import('@tiptap/core');
    const { default: StarterKit } = await import('@tiptap/starter-kit');
    const { default: Underline } = await import('@tiptap/extension-underline');
    const { default: Link } = await import('@tiptap/extension-link');
    const { default: Image } = await import('@tiptap/extension-image');
    const { default: Highlight } = await import('@tiptap/extension-highlight');
    const { default: TextAlign } = await import('@tiptap/extension-text-align');
    const { default: Table } = await import('@tiptap/extension-table');
    const { default: TableRow } = await import('@tiptap/extension-table-row');
    const { default: TableCell } = await import('@tiptap/extension-table-cell');
    const { default: TableHeader } = await import('@tiptap/extension-table-header');
    const { default: TaskList } = await import('@tiptap/extension-task-list');
    const { default: TaskItem } = await import('@tiptap/extension-task-item');

    // Load page content from hidden meta tag
    const meta = document.getElementById('page-content-json');
    let content = null;
    if (meta && meta.textContent.trim()) {
        try {
            content = JSON.parse(meta.textContent);
        } catch (e) {
            console.warn('Failed to parse page content JSON, starting fresh');
        }
    }

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
            if (typeof onEditorUpdate === 'function') {
                onEditorUpdate(currentEditor);
            }
        },
    });

    // Reset dirty tracking
    lastSavedJSON = JSON.stringify(currentEditor.getJSON());
    window.currentEditor = currentEditor;
}

function destroyEditor() {
    if (currentEditor) {
        currentEditor.destroy();
        currentEditor = null;
        currentPageId = null;
    }
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
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (currentEditor) forceSave(currentPageId, currentEditor);
        }
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            const searchInput = document.querySelector('input[name="q"]');
            if (searchInput) searchInput.focus();
        }
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            // Create new section — focus the section form
            const form = document.querySelector('#section-list-sortable form input');
            if (form) form.focus();
        }
        if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            // Create new page
            const form = document.querySelector('#page-list-sortable form input');
            if (form) form.focus();
        }
    });
});

// ── Re-init after HTMX swaps ─────────────────────────────────────────────────

document.body.addEventListener('htmx:afterSwap', async (evt) => {
    const editorContainer = document.getElementById('editor-content');
    if (editorContainer && editorContainer.dataset.pageId) {
        const newPageId = parseInt(editorContainer.dataset.pageId);
        if (newPageId !== currentPageId) {
            await initEditor(newPageId);
        }
    }
});

// ── HTMX navigation guard — force save before swap ───────────────────────────

document.body.addEventListener('htmx:beforeSwap', (evt) => {
    if (currentEditor && typeof isEditorDirty === 'function' && isEditorDirty()) {
        evt.preventDefault();
        forceSave(currentPageId, currentEditor).then(() => {
            destroyEditor();
            // Allow the swap to proceed
            htmx.trigger(evt.detail.target, 'htmx:afterForceSave');
            // Re-trigger the original event
            setTimeout(() => {
                htmx.trigger(evt.detail.elt, evt.detail.triggerSpec.trigger);
            }, 100);
        });
    } else if (currentEditor) {
        destroyEditor();
    }
});
