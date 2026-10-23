/**
 * Sortable drag-and-drop. Reorders notebooks, chapters, and pages.
 */

import Sortable from 'sortablejs';
import { reorderPositions } from './firebase-db.js';
import { betaAction, betaError } from './beta-logger.js';

let instances = [];

export function destroyNavDnD() {
    for (const sortable of instances) {
        try { sortable.destroy(); } catch { /* already gone */ }
    }
    instances = [];
}

function bind(el, options) {
    if (!el || typeof Sortable === 'undefined') return;
    instances.push(Sortable.create(el, options));
}

/**
 * @param {object} api
 * @param {() => Promise<void>} [api.refreshNotebooks]
 * @param {() => Promise<void>} [api.refreshSections]
 * @param {() => Promise<void>} [api.refreshPages]
 */
export function initNavDnD(api) {
    destroyNavDnD();

    const tabs = document.querySelector('.tk-tabs-container');
    bind(tabs, {
        handle: '.nb-drag-handle',
        draggable: '[data-nb-id]',
        animation: 150,
        onEnd: async () => {
            const ids = [...tabs.querySelectorAll('[data-nb-id]')].map((el) => el.dataset.nbId).filter(Boolean);
            try {
                betaAction('dnd_reorder_notebooks', { count: ids.length });
                await reorderPositions('notebooks', ids);
                if (api.refreshNotebooks) await api.refreshNotebooks();
            } catch (e) {
                betaError('dnd_notebook_failed', e);
            }
        },
    });

    document.querySelectorAll('.section-dnd-list').forEach((list) => {
        bind(list, {
            handle: '.section-drag-handle',
            draggable: '.section-dnd-item',
            animation: 150,
            onEnd: async () => {
                const ids = [...list.querySelectorAll(':scope > .section-dnd-item')]
                    .map((el) => el.dataset.sectionId)
                    .filter(Boolean);
                try {
                    betaAction('dnd_reorder_sections', { count: ids.length });
                    await reorderPositions('sections', ids);
                    if (api.refreshSections) await api.refreshSections();
                } catch (e) {
                    betaError('dnd_section_failed', e);
                    if (api.refreshSections) await api.refreshSections();
                }
            },
        });
    });

    const pageList = document.getElementById('page-list');
    bind(pageList, {
        handle: '.page-drag-handle',
        draggable: '.page-dnd-item',
        animation: 150,
        onEnd: async () => {
            const ids = [...pageList.querySelectorAll(':scope > .page-dnd-item')]
                .map((el) => el.dataset.pageId)
                .filter(Boolean);
            try {
                betaAction('dnd_reorder_pages', { count: ids.length });
                await reorderPositions('pages', ids);
                if (api.refreshPages) await api.refreshPages();
            } catch (e) {
                betaError('dnd_page_failed', e);
                if (api.refreshPages) await api.refreshPages();
            }
        },
    });
}
