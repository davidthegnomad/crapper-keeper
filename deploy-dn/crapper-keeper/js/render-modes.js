/**
 * Markdown + HTML/HTMX page rendering for Crapper Keeper.
 * Rich (TipTap) stays in editor.js; this handles source modes.
 */

import { marked } from 'marked';
import htmx from 'htmx.org';

marked.setOptions({ gfm: true, breaks: true });

window.htmx = htmx;
htmx.config.selfRequestsOnly = false;
htmx.config.allowEval = false;
htmx.config.historyEnabled = false;

export const PAGE_MODES = ['rich', 'markdown', 'html'];

export function normalizePageMode(mode) {
    if (mode === 'markdown' || mode === 'html' || mode === 'rich') return mode;
    return 'rich';
}

export function markdownToHtml(src) {
    try {
        return marked.parse(src || '', { async: false }) || '';
    } catch (e) {
        console.warn('Markdown parse failed', e);
        return `<pre>${escapeHtml(src || '')}</pre>`;
    }
}

export function htmlToPlain(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html || '';
    return (wrap.textContent || '').replace(/\s+/g, ' ').trim();
}

export function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[c]));
}

/** Pull body innerHTML if a full document was pasted. */
export function htmlFragment(src) {
    const raw = String(src ?? '');
    if (!/<html[\s>]/i.test(raw) && !/<body[\s>]/i.test(raw)) return raw;
    try {
        const doc = new DOMParser().parseFromString(raw, 'text/html');
        return doc.body ? doc.body.innerHTML : raw;
    } catch {
        return raw;
    }
}

/**
 * Strip scripts and inline handlers.
 * Markdown: also drop iframe/object and javascript: URLs.
 * HTML/HTMX: keep hx-* and most tags so HTMX can run.
 */
export function sanitizeHtml(html, { allowHtmx = false } = {}) {
    const wrap = document.createElement('div');
    wrap.innerHTML = htmlFragment(html);
    wrap.querySelectorAll('script,object,embed,link[rel="import"]').forEach((el) => el.remove());
    if (!allowHtmx) {
        wrap.querySelectorAll('iframe,form').forEach((el) => el.remove());
    }
    wrap.querySelectorAll('*').forEach((el) => {
        [...el.attributes].forEach((a) => {
            const name = a.name.toLowerCase();
            if (name.startsWith('on')) el.removeAttribute(a.name);
            if (!allowHtmx && name.startsWith('hx-')) el.removeAttribute(a.name);
            if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                /^\s*javascript:/i.test(a.value)) {
                el.removeAttribute(a.name);
            }
        });
    });
    return wrap.innerHTML;
}

export function renderMarkdownPreview(src) {
    return sanitizeHtml(markdownToHtml(src), { allowHtmx: false });
}

export function renderHtmlPreview(src) {
    return sanitizeHtml(src, { allowHtmx: true });
}

export function mountPreview(el, html, { htmx: useHtmx = false } = {}) {
    if (!el) return;
    el.innerHTML = html || '<p class="ck-preview-empty">Nothing to preview yet.</p>';
    if (useHtmx && window.htmx) {
        window.htmx.process(el);
    }
}

export function getSourceView() {
    try {
        const v = localStorage.getItem('ck-source-view');
        if (v === 'source' || v === 'preview' || v === 'split') return v;
    } catch { /* ignore */ }
    return 'split';
}

export function setSourceView(view) {
    try { localStorage.setItem('ck-source-view', view); } catch { /* ignore */ }
}
