/**
 * Local tool API checks. Notebook tools only. Deletes need confirm: true.
 * Secret fields are removed from results.
 */

const catalog = require('./tool-catalog.json');

function apiTools() {
    return catalog.tools.filter((tool) => tool.api);
}

function checkToolCall(name, args) {
    const known = apiTools().some((tool) => tool.function.name === name);
    if (!known) return { ok: false, error: 'That tool is not on this API.' };
    if (String(name).startsWith('delete_') && (!args || args.confirm !== true)) {
        return { ok: false, error: 'Set confirm to true to delete.' };
    }
    return { ok: true };
}

function publicResult(value) {
    const json = JSON.stringify(value, (key, item) => {
        if (key === 'secret' || key === 'ciphertext' || key === 'passphrase') return undefined;
        return item;
    });
    return JSON.parse(json);
}

async function handleApi({ method, url, headers, body, token, callTool }) {
    const header = headers && (headers.authorization || headers.Authorization) || '';
    if (header !== `Bearer ${token}`) {
        return { status: 401, body: { error: 'Unauthorized' } };
    }
    const path = String(url || '').split('?')[0];
    if (method === 'GET' && path === '/v1/tools') {
        return {
            status: 200,
            body: { tools: apiTools().map(({ type, function: fn }) => ({ type, function: fn })) },
        };
    }
    if (method === 'POST' && path === '/v1/tools/call') {
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch {
            return { status: 400, body: { error: 'Send JSON.' } };
        }
        const name = parsed.name;
        const args = parsed.arguments && typeof parsed.arguments === 'object' ? parsed.arguments : {};
        const check = checkToolCall(name, args);
        if (!check.ok) return { status: 400, body: check };
        try {
            const result = publicResult(await callTool(name, args));
            return { status: 200, body: { result } };
        } catch (err) {
            return { status: 500, body: { error: err.message || 'The tool failed.' } };
        }
    }
    return { status: 404, body: { error: 'Not found' } };
}

module.exports = { catalog, apiTools, checkToolCall, publicResult, handleApi };
