/**
 * Crapper Keeper — Browser Extension Background
 * Context menu handler + Firestore save.
 * 
 * Auth strategy: user signs into the webapp with Google first.
 * The extension picks up the Firebase session automatically
 * since it shares the same Firebase project.
 */

// ── Firebase Init ───────────────────────────────────────────────────────────

importScripts(
    'https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore-compat.js'
);

firebase.initializeApp({
    apiKey: "AIzaSyAsI-4TWgro-hzpij93EA1FeG57Zaxz-EA",
    authDomain: "davidthegnomadorg.firebaseapp.com",
    projectId: "davidthegnomadorg",
    storageBucket: "davidthegnomadorg.firebasestorage.app",
});

const db = firebase.firestore();
const auth = firebase.auth();

// ── Context Menus ───────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({ id: 'ck-save-page', title: 'Save to Crapper Keeper', contexts: ['page'] });
    chrome.contextMenus.create({ id: 'ck-save-selection', title: 'Save selection to CK', contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'ck-save-image', title: 'Save image to CK', contexts: ['image'] });
    chrome.contextMenus.create({ id: 'ck-save-link', title: 'Save link to CK', contexts: ['link'] });
});

// ── Auth ─────────────────────────────────────────────────────────────────────

// Listen for auth state — Firefox/Chrome persist this across service worker restarts
let currentUserId = null;
auth.onAuthStateChanged(user => {
    currentUserId = user?.uid || null;
});

async function ensureAuth() {
    if (currentUserId) return currentUserId;

    // Try to sign in with persistence from the webapp session
    try {
        const result = await auth.getRedirectResult();
        if (result.user) {
            currentUserId = result.user.uid;
            return currentUserId;
        }
    } catch (e) { /* no pending redirect */ }

    // Not signed in — prompt user to sign into the webapp first
    return null;
}

// ── Save Logic ───────────────────────────────────────────────────────────────

async function getDefaultTarget(uid) {
    const prefs = await chrome.storage.sync.get(['notebookId', 'sectionId']);
    if (prefs.notebookId && prefs.sectionId) {
        return { notebookId: prefs.notebookId, sectionId: prefs.sectionId };
    }
    const nbs = await db.collection('notebooks').where('userId', '==', uid).orderBy('position').limit(1).get();
    if (nbs.empty) return null;
    const nbId = nbs.docs[0].id;
    const secs = await db.collection('sections').where('userId', '==', uid).where('notebookId', '==', nbId).orderBy('position').limit(1).get();
    if (secs.empty) return null;
    return { notebookId: nbId, sectionId: secs.docs[0].id };
}

async function saveToFirestore({ title, contentJson, contentPlain, url, sectionId, uid }) {
    await db.collection('pages').add({
        userId: uid,
        sectionId,
        title: title || 'Untitled',
        contentJson: typeof contentJson === 'string' ? contentJson : JSON.stringify(contentJson),
        contentPlain: contentPlain || '',
        url: url || '',
        position: Date.now(),
        isCollapsed: false,
        treePath: '',
        createdAt: firebase.firestore.Timestamp.now(),
        updatedAt: firebase.firestore.Timestamp.now(),
    });
}

// ── Context Menu Handler ─────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const uid = await ensureAuth();
    if (!uid) {
        // Open webapp in new tab so user can sign in
        chrome.tabs.create({ url: 'https://davidthegnomadorg.web.app/crapper-keeper/' });
        return;
    }

    const target = await getDefaultTarget(uid);
    if (!target) {
        chrome.tabs.create({ url: 'https://davidthegnomadorg.web.app/crapper-keeper/' });
        return;
    }

    let title = '', contentPlain = '';
    const url = tab?.url || info.pageUrl || '';

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
            contentPlain = `Image: ${info.srcUrl}`;
            break;
        case 'ck-save-link':
            title = info.linkUrl || 'Link';
            contentPlain = `${info.linkUrl}\nFrom: ${url}`;
            break;
    }

    const contentJson = {
        type: 'doc',
        content: [{ type: 'paragraph', content: title ? [{ type: 'text', text: contentPlain.split('\n')[0] || '' }] : [] }]
    };

    try {
        await saveToFirestore({ title, contentJson, contentPlain, url, sectionId: target.sectionId, uid });
        // Badge feedback
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#107c41' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
    } catch (e) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#d83b01' });
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
    }
});

// ── Popup bridge ─────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'getNotebooks') {
        ensureAuth().then(async (uid) => {
            if (!uid) return sendResponse({ error: 'Sign in at crapper-keeper first' });
            const nbs = await db.collection('notebooks').where('userId', '==', uid).orderBy('position').get();
            const list = [];
            for (const nb of nbs.docs) {
                const secs = await db.collection('sections').where('userId', '==', uid).where('notebookId', '==', nb.id).orderBy('position').get();
                list.push({ id: nb.id, title: nb.data().title, sections: secs.docs.map(s => ({ id: s.id, title: s.data().title })) });
            }
            sendResponse(list);
        });
        return true;
    }
});
