/**
 * Crapper Keeper — Browser Extension Background (MV3 service worker)
 *
 * Auth: the extension does its OWN Google sign-in via chrome.identity
 * (a browser login can't be shared across origins). We use the project's
 * existing Web OAuth client, exchange the Google token for a Firebase
 * session via the Identity Toolkit REST API, then talk to Firestore over
 * REST with that Firebase ID token — no bundled SDK, no remote scripts.
 */

// ── Config (all values are public browser identifiers) ───────────────────────

const API_KEY = 'AIzaSyAsI-4TWgro-hzpij93EA1FeG57Zaxz-EA';
const PROJECT_ID = 'davidthegnomadorg';
const WEB_CLIENT_ID = '987094737269-r0plrjp2m3qab5idbuqkijckvl90j9rf.apps.googleusercontent.com';
const WEBAPP_URL = 'https://davidthegnomadorg.web.app/crapper-keeper/';

const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SIGN_IN_IDP = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${API_KEY}`;
const TOKEN_REFRESH = `https://securetoken.googleapis.com/v1/token?key=${API_KEY}`;

// ── Context menus ─────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({ id: 'ck-save-page', title: 'Save to Crapper Keeper', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'ck-save-selection', title: 'Save selection to CK', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ck-save-image', title: 'Save image to CK', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'ck-save-link', title: 'Save link to CK', contexts: ['link'] });
});

// ── Auth ───────────────────────────────────────────────────────────────────────

async function launchGoogleSignIn() {
    const redirectUri = chrome.identity.getRedirectURL(); // https://<ext-id>.chromiumapp.org/
    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: WEB_CLIENT_ID,
        response_type: 'token',
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        prompt: 'select_account',
    }).toString();

    const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true });
    if (!responseUrl) throw new Error('Sign-in cancelled');

    const match = responseUrl.match(/[#&]access_token=([^&]+)/);
    if (!match) throw new Error('No access token in OAuth response');
    const googleAccessToken = decodeURIComponent(match[1]);

    const resp = await fetch(SIGN_IN_IDP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            postBody: `access_token=${googleAccessToken}&providerId=google.com`,
            requestUri: redirectUri,
            returnIdpCredential: true,
            returnSecureToken: true,
        }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Firebase sign-in failed');

    await chrome.storage.local.set({
        fbIdToken: data.idToken,
        fbRefreshToken: data.refreshToken,
        fbExpiry: Date.now() + Number(data.expiresIn || 3600) * 1000,
        uid: data.localId,
    });
    return { idToken: data.idToken, uid: data.localId };
}

async function getValidAuth() {
    const s = await chrome.storage.local.get(['fbIdToken', 'fbRefreshToken', 'fbExpiry', 'uid']);
    if (!s.fbRefreshToken) return null;

    // Still valid (60s safety margin)
    if (s.fbIdToken && s.fbExpiry && Date.now() < s.fbExpiry - 60000) {
        return { idToken: s.fbIdToken, uid: s.uid };
    }

    // Refresh
    const resp = await fetch(TOKEN_REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.fbRefreshToken)}`,
    });
    const data = await resp.json();
    if (!resp.ok) {
        await chrome.storage.local.remove(['fbIdToken', 'fbRefreshToken', 'fbExpiry', 'uid']);
        return null;
    }
    await chrome.storage.local.set({
        fbIdToken: data.id_token,
        fbRefreshToken: data.refresh_token,
        fbExpiry: Date.now() + Number(data.expires_in || 3600) * 1000,
        uid: data.user_id,
    });
    return { idToken: data.id_token, uid: data.user_id };
}

async function ensureAuth(interactive) {
    const existing = await getValidAuth();
    if (existing) return existing;
    if (!interactive) return null;
    return launchGoogleSignIn();
}

// ── Firestore REST helpers ──────────────────────────────────────────────────────

function fsHeaders(idToken) {
    return { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
}

function fromValue(v) {
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
    return null;
}

function fromFields(fields) {
    const out = {};
    for (const k in fields) out[k] = fromValue(fields[k]);
    return out;
}

function eqFilter(field, value) {
    return { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } };
}

async function runQuery(idToken, collectionId, filters, orderField, limit) {
    const where = filters.length === 1 ? filters[0] : { compositeFilter: { op: 'AND', filters } };
    const structuredQuery = { from: [{ collectionId }], where };
    if (orderField) structuredQuery.orderBy = [{ field: { fieldPath: orderField }, direction: 'ASCENDING' }];
    if (limit) structuredQuery.limit = limit;

    const resp = await fetch(`${FS_BASE}:runQuery`, {
        method: 'POST',
        headers: fsHeaders(idToken),
        body: JSON.stringify({ structuredQuery }),
    });
    const rows = await resp.json();
    if (!resp.ok) throw new Error(rows.error?.message || 'Firestore query failed');
    return (rows || [])
        .filter(r => r.document)
        .map(r => ({ id: r.document.name.split('/').pop(), ...fromFields(r.document.fields || {}) }));
}

async function createPage(idToken, uid, sectionId, { title, contentJson, contentPlain, url }) {
    const now = new Date().toISOString();
    const fields = {
        userId: { stringValue: uid },
        sectionId: { stringValue: sectionId },
        parentPageId: { nullValue: null },
        title: { stringValue: title || 'Untitled' },
        contentJson: { stringValue: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson) },
        contentPlain: { stringValue: contentPlain || '' },
        url: { stringValue: url || '' },
        position: { integerValue: String(Date.now()) },
        isCollapsed: { booleanValue: false },
        treePath: { stringValue: '' },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
    };
    const resp = await fetch(`${FS_BASE}/pages`, {
        method: 'POST',
        headers: fsHeaders(idToken),
        body: JSON.stringify({ fields }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Save failed');
    return data;
}

// ── Data helpers ────────────────────────────────────────────────────────────────

async function loadNotebooks({ idToken, uid }) {
    const nbs = await runQuery(idToken, 'notebooks', [eqFilter('userId', uid)], 'position');
    const list = [];
    for (const nb of nbs) {
        const secs = await runQuery(
            idToken, 'sections',
            [eqFilter('userId', uid), eqFilter('notebookId', nb.id)],
            'position'
        );
        list.push({ id: nb.id, title: nb.title, sections: secs.map(s => ({ id: s.id, title: s.title })) });
    }
    return list;
}

async function getDefaultTarget({ idToken, uid }) {
    const prefs = await chrome.storage.sync.get(['notebookId', 'sectionId']);
    if (prefs.notebookId && prefs.sectionId) {
        return { notebookId: prefs.notebookId, sectionId: prefs.sectionId };
    }
    const nbs = await runQuery(idToken, 'notebooks', [eqFilter('userId', uid)], 'position', 1);
    if (!nbs.length) return null;
    const nbId = nbs[0].id;
    const secs = await runQuery(
        idToken, 'sections',
        [eqFilter('userId', uid), eqFilter('notebookId', nbId)],
        'position', 1
    );
    if (!secs.length) return null;
    return { notebookId: nbId, sectionId: secs[0].id };
}

// ── TipTap doc builder (keeps full content, not just first line) ─────────────────

function buildDoc(text) {
    const lines = (text || '').split('\n');
    return {
        type: 'doc',
        content: lines.map(line =>
            line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' }
        ),
    };
}

// ── Badge feedback ────────────────────────────────────────────────────────────

function flashBadge(text, color, ms) {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), ms);
}

// ── Context menu handler ─────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    let auth;
    try {
        auth = await ensureAuth(true); // right-click is a user gesture → interactive OK
    } catch (e) {
        console.error('CK auth failed:', e);
        flashBadge('!', '#d83b01', 3000);
        return;
    }
    if (!auth) {
        chrome.tabs.create({ url: WEBAPP_URL });
        return;
    }

    let target;
    try {
        target = await getDefaultTarget(auth);
    } catch (e) {
        console.error('CK target lookup failed:', e);
        flashBadge('!', '#d83b01', 3000);
        return;
    }
    if (!target) {
        chrome.tabs.create({ url: WEBAPP_URL });
        return;
    }

    const url = tab?.url || info.pageUrl || '';
    let title = '';
    let contentPlain = '';

    switch (info.menuItemId) {
        case 'ck-save-page':
            title = tab?.title || url;
            contentPlain = `${title}\n${url}`;
            break;
        case 'ck-save-selection':
            title = tab?.title || 'Selection';
            contentPlain = `"${info.selectionText || ''}"\n\nFrom: ${title}\n${url}`;
            break;
        case 'ck-save-image':
            title = 'Image: ' + (info.srcUrl?.split('/').pop() || 'untitled');
            contentPlain = `Image: ${info.srcUrl}\nFrom: ${url}`;
            break;
        case 'ck-save-link':
            title = info.linkUrl || 'Link';
            contentPlain = `${info.linkUrl}\nFrom: ${url}`;
            break;
        default:
            return;
    }

    try {
        await createPage(auth.idToken, auth.uid, target.sectionId, {
            title,
            contentJson: buildDoc(contentPlain),
            contentPlain,
            url,
        });
        flashBadge('\u2713', '#107c41', 2000);
    } catch (e) {
        console.error('CK save failed:', e);
        flashBadge('!', '#d83b01', 3000);
    }
});

// ── Popup bridge ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    (async () => {
        try {
            if (msg.action === 'init') {
                const auth = await ensureAuth(false);
                if (!auth) return sendResponse({ signedIn: false });
                return sendResponse({ signedIn: true, notebooks: await loadNotebooks(auth) });
            }
            if (msg.action === 'signIn') {
                const auth = await ensureAuth(true);
                if (!auth) return sendResponse({ signedIn: false, error: 'Sign-in cancelled' });
                return sendResponse({ signedIn: true, notebooks: await loadNotebooks(auth) });
            }
            if (msg.action === 'signOut') {
                await chrome.storage.local.remove(['fbIdToken', 'fbRefreshToken', 'fbExpiry', 'uid']);
                return sendResponse({ signedIn: false });
            }
            sendResponse({ error: 'Unknown action' });
        } catch (e) {
            console.error('CK message error:', e);
            sendResponse({ error: e.message || String(e) });
        }
    })();
    return true; // keep channel open for async sendResponse
});
