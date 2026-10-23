/**
 * Turns the local model's text into a short list of allowed actions.
 * The model never touches the disk itself. The app runs this list.
 */

export const TOOL_NAMES = [
    'switch_view',
    'open_page',
    'create_notebook',
    'rename_notebook',
    'delete_notebook',
    'create_section',
    'rename_section',
    'delete_section',
    'create_page',
    'update_page',
    'delete_page',
    'create_slate',
    'update_slate',
    'delete_slate',
    'set_preview',
    'create_sticky',
    'update_sticky',
    'delete_sticky',
    'create_secret',
    'update_secret',
    'delete_secret',
];

const VIEWS = new Set(['notebook', 'slate', 'preview', 'stickies', 'vault']);

export function userAskedToDelete(message) {
    const text = String(message || '')
        .replace(/\b(do not|don't|dont)\s+(delete|remove|erase|trash|discard)\b/gi, ' ');
    return /\b(delete|remove|erase|trash|discard)\b/i.test(text)
        || /\bget rid of\b/i.test(text);
}

function extractJson(text) {
    const start = String(text || '').indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) {
            if (esc) esc = false;
            else if (ch === '\\') esc = true;
            else if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return null;
}

export function normalizeTool(tool) {
    if (!tool || typeof tool !== 'object') return null;
    const name = String(tool.name || '');
    if (!TOOL_NAMES.includes(name)) return null;
    const source = tool.args && typeof tool.args === 'object' && !Array.isArray(tool.args) ? tool.args : {};
    const args = {};
    for (const [key, value] of Object.entries(source)) {
        if (typeof value !== 'string') continue;
        const long = name === 'set_preview' || key === 'body' || key === 'html' || key === 'css' || key === 'js' || key === 'secret' || key === 'notes';
        args[key] = value.slice(0, long ? 20000 : 500);
    }
    if (name === 'switch_view' && args.view && !VIEWS.has(args.view)) return null;
    return { name, args };
}

export function parseAssistantReply(text) {
    const raw = String(text || '').replace(/<\|im_end\|>/g, '').trim();
    const json = extractJson(raw);
    if (!json) return { say: raw.slice(0, 400), tools: [] };
    try {
        const obj = JSON.parse(json);
        const say = typeof obj.say === 'string' ? obj.say.slice(0, 400) : '';
        const list = Array.isArray(obj.tools) ? obj.tools : [];
        const tools = [];
        for (const item of list) {
            if (tools.length >= 8) break;
            const tool = normalizeTool(item);
            if (tool) tools.push(tool);
        }
        return { say, tools };
    } catch {
        return { say: raw.slice(0, 400), tools: [] };
    }
}

export function gateTools(tools, message) {
    const allowDelete = userAskedToDelete(message);
    const kept = [];
    const blocked = [];
    for (const tool of tools || []) {
        if (String(tool.name).startsWith('delete_') && !allowDelete) {
            blocked.push(tool.name);
            continue;
        }
        kept.push(tool);
    }
    return { tools: kept, blocked };
}
