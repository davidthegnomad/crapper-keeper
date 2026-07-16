/**
 * Crapper Keeper — Auto-Save
 * Debounced save, save-on-blur, save-on-beforeunload, undo compatibility.
 */

let saveTimer = null;
let lastSavedJSON = null;
const DEBOUNCE_MS = 1500;

// ── Debounced auto-save on editor update ─────────────────────────────────────

function onEditorUpdate(editor) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        saveToServer(editor);
    }, DEBOUNCE_MS);
    updateSaveStatus('unsaved');
}

// ── Save to server ───────────────────────────────────────────────────────────

async function saveToServer(editor) {
    if (!currentPageId) return;

    const title = document.querySelector('#page-title')?.innerText?.trim() || 'Untitled Page';
    const contentJson = JSON.stringify(editor.getJSON());

    try {
        const res = await fetch(`/pages/${currentPageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content_json: contentJson }),
        });

        if (res.ok) {
            lastSavedJSON = contentJson;
            editor.currentContent = contentJson;
            updateSaveStatus('saved');
            setTimeout(() => updateSaveStatus(''), 3000);
        } else {
            updateSaveStatus('error');
        }
    } catch (e) {
        updateSaveStatus('error');
        // Retry after 5s
        setTimeout(() => saveToServer(editor), 5000);
    }
}

// ── Force save (used by HTMX navigation guard and beforeunload) ──────────────

async function forceSave(pageId, editor) {
    clearTimeout(saveTimer);
    await saveToServer(editor);
}

// ── Dirty check ──────────────────────────────────────────────────────────────

function isEditorDirty() {
    if (!currentEditor) return false;
    const current = JSON.stringify(currentEditor.getJSON());
    return lastSavedJSON !== current;
}

// ── Save-on-blur ─────────────────────────────────────────────────────────────

document.addEventListener('focusout', (e) => {
    if (currentEditor && currentEditor.view?.dom?.contains(e.target)) {
        // User left the editor — save immediately
        clearTimeout(saveTimer);
        saveToServer(currentEditor);
    }
});

// ── Save-on-beforeunload ─────────────────────────────────────────────────────

window.addEventListener('beforeunload', (e) => {
    if (currentEditor && isEditorDirty()) {
        // Fire-and-forget save (can't use async in beforeunload)
        const title = document.querySelector('#page-title')?.innerText?.trim() || 'Untitled Page';
        navigator.sendBeacon(`/pages/${currentPageId}`, new URLSearchParams({
            title,
            content_json: JSON.stringify(currentEditor.getJSON()),
        }));
    }
});

// ── Save status indicator ────────────────────────────────────────────────────

function updateSaveStatus(status) {
    const el = document.getElementById('save-status');
    if (!el) return;
    switch (status) {
        case 'saved':
            el.innerHTML = '<span class="text-green-600 text-xs">✓ Saved</span>';
            break;
        case 'unsaved':
            el.innerHTML = '<span class="text-yellow-600 text-xs">● Unsaved</span>';
            break;
        case 'error':
            el.innerHTML = '<span class="text-red-600 text-xs">✗ Save failed</span>';
            break;
        default:
            el.innerHTML = '<span class="text-xs">📶 Connected</span>';
    }
}
