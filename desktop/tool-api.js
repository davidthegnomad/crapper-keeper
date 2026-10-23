/**
 * Loopback tool API. 127.0.0.1 only. The signed-in page runs the tool.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { handleApi } = require('./tool-guard.cjs');

function startToolApi({ userData, callTool }) {
    const token = crypto.randomBytes(24).toString('hex');
    const server = http.createServer((req, res) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > 1_000_000) {
                res.writeHead(413, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ error: 'Request is too large.' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', async () => {
            if (res.writableEnded) return;
            const outcome = await handleApi({
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: Buffer.concat(chunks).toString('utf8'),
                token,
                callTool,
            });
            res.writeHead(outcome.status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(outcome.body));
        });
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            const info = { host: '127.0.0.1', port, token, baseUrl: `http://127.0.0.1:${port}` };
            fs.mkdirSync(userData, { recursive: true });
            fs.writeFileSync(`${userData}/ck-tool-api.json`, JSON.stringify(info), { mode: 0o600 });
            resolve({ server, info });
        });
    });
}

module.exports = { startToolApi };
