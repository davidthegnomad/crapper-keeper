/**
 * Crapper Keeper — Drag & Drop
 * SortableJS integration for notebooks, pages, and sections.
 */

function postJSON(url, body) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function initPageDrag() {
    const container = document.getElementById('page-list-sortable');
    if (!container || container.dataset.dnd || typeof Sortable === 'undefined') return;
    container.dataset.dnd = '1';

    new Sortable(container, {
        animation: 150,
        ghostClass: 'bg-blue-100',
        handle: '.drag-handle',
        draggable: '[data-page-id]',
        onEnd: function () {
            const ids = [...container.querySelectorAll(':scope > [data-page-id]')].map((el) => el.dataset.pageId);
            postJSON('/pages/reorder', { ids }).catch((e) => console.error('Reorder failed:', e));
        },
    });
}

function initSectionDrag() {
    if (typeof Sortable === 'undefined') return;
    document.querySelectorAll('.section-list-sortable').forEach((container) => {
        if (container.dataset.dnd) return;
        container.dataset.dnd = '1';
        const notebookId = container.dataset.notebookId;
        new Sortable(container, {
            animation: 150,
            ghostClass: 'bg-blue-100',
            handle: '.section-drag-handle',
            draggable: '[data-section-id]',
            onEnd: function () {
                const ids = [...container.querySelectorAll(':scope > [data-section-id]')].map((el) => el.dataset.sectionId);
                postJSON(`/notebooks/${notebookId}/sections/reorder`, { ids })
                    .catch((e) => console.error('Section reorder failed:', e));
            },
        });
    });
}

function initNotebookDrag() {
    const container = document.querySelector('.tk-tabs-container');
    if (!container || container.dataset.dnd || typeof Sortable === 'undefined') return;
    container.dataset.dnd = '1';
    new Sortable(container, {
        animation: 150,
        handle: '.nb-drag-handle',
        draggable: 'a.tk-tab[data-notebook-id]',
        onEnd: async function () {
            const ids = [...container.querySelectorAll('a.tk-tab[data-notebook-id]')].map((el) => el.dataset.notebookId);
            try {
                await postJSON('/notebooks/reorder', { ids });
                window.location.reload();
            } catch (e) {
                console.error('Notebook reorder failed:', e);
            }
        },
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initPageDrag();
    initSectionDrag();
    initNotebookDrag();
});

document.body.addEventListener('htmx:afterSwap', () => {
    initPageDrag();
    initSectionDrag();
    initNotebookDrag();
});
