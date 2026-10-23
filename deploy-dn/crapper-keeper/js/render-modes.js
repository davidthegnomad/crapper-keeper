/**
 * Markdown + HTML/HTMX page rendering for Crapper Keeper.
 * Rich (TipTap) stays in editor.js; this handles source modes.
 */

import { marked } from 'marked';
import htmx from 'htmx.org';

marked.setOptions({ gfm: true, breaks: true });

window.htmx = htmx;
htmx.config.selfRequestsOnly = true;
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

const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'xlink:href', 'poster']);

/**
 * Saved note HTML cannot run scripts, frame remote sites, or fire HTMX.
 * allowHtmx is ignored — hx-* is always removed.
 */
export function sanitizeHtml(html, _opts = {}) {
    const wrap = document.createElement('div');
    wrap.innerHTML = htmlFragment(html);
    wrap.querySelectorAll('script, iframe, object, embed').forEach((el) => el.remove());
    wrap.querySelectorAll('*').forEach((el) => {
        [...el.attributes].forEach((a) => {
            const name = a.name.toLowerCase();
            if (name.startsWith('on') || name.startsWith('hx-')) el.removeAttribute(a.name);
            if (URL_ATTRS.has(name) && /^\s*javascript:/i.test(a.value)) {
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
    return sanitizeHtml(src);
}

export function mountPreview(el, html) {
    if (!el) return;
    el.innerHTML = html || '<p class="ck-preview-empty">Nothing to preview yet.</p>';
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
