/**
 * Crapper Keeper — Drag & Drop
 * SortableJS integration for pages and sections.
 */

// ── Page reorder ─────────────────────────────────────────────────────────────

function initPageDrag() {
    const container = document.getElementById('page-list-sortable');
    if (!container || typeof Sortable === 'undefined') return;

    new Sortable(container, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        handle: '.drag-handle',
        onEnd: async function (evt) {
            const pageId = evt.item.dataset.pageId;
            const newIndex = evt.newIndex;
            const newParentId = evt.item.dataset.parentPageId || null;
            const parentContainer = evt.item.parentElement;
            const parentPageId = parentContainer?.dataset?.parentPageId || null;

            try {
                await fetch(`/pages/${pageId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        position: newIndex,
                        parent_page_id: parentPageId || '',
                    }),
                });
            } catch (e) {
                console.error('Reorder failed:', e);
            }
        },
    });
}

// ── Section reorder ──────────────────────────────────────────────────────────

function initSectionDrag() {
    const container = document.getElementById('section-list-sortable');
    if (!container || typeof Sortable === 'undefined') return;

    new Sortable(container, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        handle: '.section-drag-handle',
        onEnd: async function (evt) {
            const sectionId = evt.item.dataset.sectionId;
            const newIndex = evt.newIndex;

            try {
                await fetch(`/notebooks/${evt.item.dataset.notebookId}/sections/${sectionId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ position: newIndex }),
                });
            } catch (e) {
                console.error('Section reorder failed:', e);
            }
        },
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initPageDrag();
    initSectionDrag();
});

document.body.addEventListener('htmx:afterSwap', () => {
    initPageDrag();
    initSectionDrag();
});
