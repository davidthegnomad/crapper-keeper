/** View list and preview document assembly. No browser imports. */

export const SHELL_VIEWS = [
    { id: 'notebook', label: 'Notebook', hint: 'Chapters and pages' },
    { id: 'slate', label: 'Slate', hint: 'Scratchpad with markdown preview' },
    { id: 'preview', label: 'Preview', hint: 'HTML, CSS, and JS playground' },
    { id: 'stickies', label: 'Sticky notes', hint: 'Short notes on a board' },
    { id: 'vault', label: 'Vault', hint: 'Passwords and secrets, encrypted' },
];

export function assemblePreviewDoc({ html = '', css = '', js = '' } = {}) {
    const script = String(js).replace(/<\/script/gi, '<\\/script');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}<script>${script}<\/script></body></html>`;
}

const OPEN_VIEWS = new Set(['slate', 'preview', 'stickies']);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch]));
}

export function buildOpenHash(view, { title = '', url = '', text = '' } = {}) {
    const params = new URLSearchParams();
    params.set('ck', view);
    if (title) params.set('title', String(title).slice(0, 180));
    if (url) params.set('url', String(url).slice(0, 800));
    if (text) params.set('text', String(text).slice(0, 4000));
    return `#${params.toString()}`;
}

export function readOpenHash(hash) {
    const raw = String(hash || '').replace(/^#/, '');
    if (!raw.includes('ck=')) return null;
    const params = new URLSearchParams(raw);
    const view = params.get('ck');
    if (!OPEN_VIEWS.has(view)) return null;
    return {
        view,
        title: (params.get('title') || '').slice(0, 180),
        url: (params.get('url') || '').slice(0, 800),
        text: (params.get('text') || '').slice(0, 4000),
    };
}

function clipLines(clip) {
    return [clip.title, clip.url, clip.text].map((part) => String(part || '').trim()).filter(Boolean);
}

export function applyClip(stores = {}, clip) {
    const slate = stores.slate && Array.isArray(stores.slate.notes)
        ? { activeId: stores.slate.activeId, notes: stores.slate.notes.slice() }
        : { activeId: '', notes: [] };
    const preview = {
        html: '',
        css: 'body { font-family: system-ui, sans-serif; padding: 24px; }\n',
        js: '',
        width: '100%',
        ...(stores.preview || {}),
    };
    const stickies = stores.stickies && Array.isArray(stores.stickies.notes)
        ? { notes: stores.stickies.notes.slice() }
        : { notes: [] };
    const id = `clip-${slate.notes.length + stickies.notes.length + 1}`;

    if (clip.view === 'slate') {
        const body = /^\s*#/.test(clip.text || '')
            ? clip.text
            : `# ${clip.title || 'Clip'}\n\n${[clip.url, clip.text].filter(Boolean).join('\n\n')}`;
        slate.notes.unshift({ id, title: clip.title || 'Clip', body });
        slate.activeId = id;
    } else if (clip.view === 'preview') {
        const raw = String(clip.text || '');
        if (/^\s*</.test(raw)) {
            preview.html = raw;
            preview.js = '';
        } else {
            const link = clip.url
                ? `<p><a href="${escapeHtml(clip.url)}">${escapeHtml(clip.url)}</a></p>\n`
                : '';
            preview.html = `<main>\n  <h1>${escapeHtml(clip.title || 'Clip')}</h1>\n  ${link}  <pre>${escapeHtml(raw)}</pre>\n</main>\n`;
            preview.js = '';
        }
    } else if (clip.view === 'stickies') {
        stickies.notes.unshift({
            id,
            text: clipLines(clip).join('\n\n'),
            color: '#fff3bf',
            x: 24 + (stickies.notes.length % 5) * 20,
            y: 24,
        });
    }
    return { view: clip.view, slate, preview, stickies };
}
