/**
 * Notebook export for a RAG indexer.
 * One Markdown file per page, with the notebook and chapter in the path.
 * Vault data is never read.
 */

const README = `# Crapper Keeper RAG export

These Markdown files are one page each. Point a RAG that indexes .md files at this folder.

Workspace RAG:

\`\`\`bash
python external/cli.py index
\`\`\`

Search hits cite the file path: Notebook / Chapter / Page.
The vault is not in this export.
`;

function yamlQuote(value) {
    return `"${String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

export function safeSegment(name) {
    const cleaned = String(name || 'untitled')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return cleaned || 'untitled';
}

function htmlToText(html) {
    return String(html || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim();
}

function inlineText(node) {
    return (node && node.content || []).map((part) => part.text || '').join('');
}

function jsonToMd(node) {
    if (!node) return '';
    if (Array.isArray(node)) return node.map(jsonToMd).join('');
    if (node.type === 'doc') return jsonToMd(node.content || []);
    if (node.type === 'paragraph') return `${inlineText(node)}\n\n`;
    if (node.type === 'heading') {
        const level = node.attrs && node.attrs.level ? node.attrs.level : 1;
        return `${'#'.repeat(level)} ${inlineText(node)}\n\n`;
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
        return (node.content || []).map((item, index) => {
            const text = inlineText(item.content && item.content[0]);
            const marker = node.type === 'orderedList' ? `${index + 1}. ` : '- ';
            return `${marker}${text}\n`;
        }).join('') + '\n';
    }
    if (node.type === 'taskList') {
        return (node.content || []).map((item) => {
            const checked = item.attrs && item.attrs.checked ? 'x' : ' ';
            return `- [${checked}] ${inlineText(item.content && item.content[0])}\n`;
        }).join('') + '\n';
    }
    if (node.type === 'blockquote') {
        return jsonToMd(node.content || []).split('\n').filter(Boolean).map((line) => `> ${line}`).join('\n') + '\n\n';
    }
    if (node.type === 'codeBlock') {
        const lang = node.attrs && node.attrs.language || '';
        return `\`\`\`${lang}\n${inlineText(node)}\n\`\`\`\n\n`;
    }
    if (node.type === 'horizontalRule') return '---\n\n';
    if (node.content) return jsonToMd(node.content);
    return '';
}

export function pageBody(page) {
    const mode = page && page.pageMode || 'rich';
    if (mode === 'markdown') return String(page.contentSource || page.contentPlain || '').trim();
    if (mode === 'html') return htmlToText(page.contentSource || page.contentPlain || '');
    if (page && page.contentJson && page.contentJson !== '{}') {
        try {
            const doc = JSON.parse(page.contentJson);
            const markdown = jsonToMd(doc).trim();
            if (markdown) return markdown;
        } catch { /* use plain text */ }
    }
    return String(page && (page.contentPlain || page.contentSource) || '').trim();
}

function updatedStamp(page) {
    const value = page && page.updatedAt;
    if (!value) return '';
    if (typeof value === 'string') return value.slice(0, 10);
    if (typeof value.toDate === 'function') {
        try { return value.toDate().toISOString().slice(0, 10); } catch { return ''; }
    }
    return '';
}

export function pageToRagMarkdown(page, { notebook, chapter }) {
    const title = page.title || 'Untitled';
    const updated = updatedStamp(page);
    const lines = [
        '---',
        `title: ${yamlQuote(title)}`,
        `notebook: ${yamlQuote(notebook)}`,
        `chapter: ${yamlQuote(chapter)}`,
        `page_id: ${yamlQuote(page.id || '')}`,
        'source: "crapper-keeper"',
    ];
    if (updated) lines.push(`updated: ${yamlQuote(updated)}`);
    lines.push('---', '', `# ${title}`, '', pageBody(page), '');
    return lines.join('\n');
}

function uniquePath(used, parts) {
    const base = parts.map(safeSegment).join('/');
    let path = `${base}.md`;
    let n = 2;
    while (used.has(path)) {
        path = `${base} ${n}.md`;
        n += 1;
    }
    used.add(path);
    return path;
}

function addPage(files, used, page, notebook, chapter, prefix) {
    const parts = [...prefix, page.title || 'Untitled'];
    files.push({
        path: uniquePath(used, parts),
        markdown: pageToRagMarkdown(page, { notebook, chapter }),
    });
    for (const sub of page.subpages || []) {
        addPage(files, used, sub, notebook, chapter, [...prefix, page.title || 'Untitled']);
    }
}

export function buildRagFiles(input = {}) {
    const notebook = input.notebookTitle || input.notebook || 'Notebook';
    const files = [];
    const used = new Set();
    for (const section of input.sections || []) {
        const chapter = section.title || 'Chapter';
        for (const page of section.pages || []) {
            addPage(files, used, page, notebook, chapter, [notebook, chapter]);
        }
    }
    files.push({ path: 'README.md', markdown: README });
    return files;
}

export function buildSingleMarkdown(input) {
    return buildRagFiles(input)
        .filter((file) => file.path !== 'README.md')
        .map((file) => file.markdown.trim())
        .join('\n\n---\n\n');
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
        crc ^= bytes[i];
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function u16(view, offset, value) {
    view.setUint16(offset, value, true);
}

function u32(view, offset, value) {
    view.setUint32(offset, value, true);
}

export function buildZip(files, when = new Date()) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const year = Math.max(1980, when.getFullYear());
    const dosDate = ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2);
    for (const file of files) {
        const name = encoder.encode(file.path);
        const data = encoder.encode(file.markdown);
        const crc = crc32(data);
        const local = new Uint8Array(30 + name.length + data.length);
        const view = new DataView(local.buffer);
        u32(view, 0, 0x04034b50);
        u16(view, 4, 20);
        u16(view, 8, 0);
        u16(view, 10, dosTime);
        u16(view, 12, dosDate);
        u32(view, 14, crc);
        u32(view, 18, data.length);
        u32(view, 22, data.length);
        u16(view, 26, name.length);
        local.set(name, 30);
        local.set(data, 30 + name.length);
        locals.push(local);
        const central = new Uint8Array(46 + name.length);
        const cv = new DataView(central.buffer);
        u32(cv, 0, 0x02014b50);
        u16(cv, 4, 20);
        u16(cv, 6, 20);
        u16(cv, 10, 0);
        u16(cv, 12, dosTime);
        u16(cv, 14, dosDate);
        u32(cv, 16, crc);
        u32(cv, 20, data.length);
        u32(cv, 24, data.length);
        u16(cv, 28, name.length);
        u32(cv, 42, offset);
        central.set(name, 46);
        centrals.push(central);
        offset += local.length;
    }
    const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    u32(ev, 0, 0x06054b50);
    u16(ev, 8, files.length);
    u16(ev, 10, files.length);
    u32(ev, 12, centralSize);
    u32(ev, 16, offset);
    const total = offset + centralSize + end.length;
    const out = new Uint8Array(total);
    let cursor = 0;
    for (const part of [...locals, ...centrals, end]) {
        out.set(part, cursor);
        cursor += part.length;
    }
    return out;
}

export function ragZipName(notebookTitle) {
    return `${safeSegment(notebookTitle)}-rag.zip`;
}
