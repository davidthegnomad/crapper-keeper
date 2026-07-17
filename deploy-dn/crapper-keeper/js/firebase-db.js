/**
 * Crapper Keeper — Firestore Data Layer
 * Replaces all Python routers. Direct Firestore reads/writes from browser.
 */

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
    getFirestore, collection, doc, getDoc, getDocs, addDoc,
    updateDoc, deleteDoc, query, where, orderBy, limit, writeBatch, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';
import {
    getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
    getRedirectResult, signOut, onAuthStateChanged, setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js';

// ── Config ──────────────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey: "AIzaSyAsI-4TWgro-hzpij93EA1FeG57Zaxz-EA",
    authDomain: "davidthegnomadorg.firebaseapp.com",
    projectId: "davidthegnomadorg",
    storageBucket: "davidthegnomadorg.firebasestorage.app",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const persistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => {});

// ── Auth ────────────────────────────────────────────────────────────────────

export function initAuth(callback) {
    // Complete redirect flow (Arc / COOP-safe path) before listening
    Promise.all([persistenceReady, getRedirectResult(auth).catch((e) => {
        console.warn('getRedirectResult:', e);
    })]).finally(() => {
        onAuthStateChanged(auth, callback);
    });
}

export async function signInWithGoogle() {
    await persistenceReady;
    try {
        return await signInWithPopup(auth, googleProvider);
    } catch (e) {
        const code = e?.code || '';
        // Popup broken by COOP / blockers — fall back to full-page redirect
        if (
            code === 'auth/popup-blocked' ||
            code === 'auth/cancelled-popup-request' ||
            code === 'auth/popup-closed-by-user' ||
            String(e?.message || '').includes('Cross-Origin-Opener-Policy')
        ) {
            // User closed popup intentionally — don't force redirect
            if (code === 'auth/popup-closed-by-user') throw e;
            await signInWithRedirect(auth, googleProvider);
            return null;
        }
        // Unknown popup failure (common with COOP noise): try redirect
        console.warn('Popup sign-in failed, trying redirect:', e);
        await signInWithRedirect(auth, googleProvider);
        return null;
    }
}

export async function signOutUser() {
    return signOut(auth);
}

export function getCurrentUser() {
    return auth.currentUser;
}

function requireUid() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in');
    return user.uid;
}

// ── Notebooks ───────────────────────────────────────────────────────────────

export async function getNotebooks() {
    const uid = requireUid();
    const q = query(
        collection(db, 'notebooks'),
        where('userId', '==', uid),
        orderBy('position')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getNotebook(id) {
    const snap = await getDoc(doc(db, 'notebooks', id));
    if (!snap.exists()) return null;
    const data = { id: snap.id, ...snap.data() };
    if (data.userId !== requireUid()) return null;
    return data;
}

export async function createNotebook(title) {
    const uid = requireUid();
    const ref = await addDoc(collection(db, 'notebooks'), {
        userId: uid,
        title,
        color: '#5B9BD5',
        position: Date.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });
    return ref.id;
}

export async function deleteNotebook(id) {
    const sections = await getSections(id);
    const batch = writeBatch(db);
    for (const s of sections) {
        const pages = await getPages(s.id);
        for (const p of pages) batch.delete(doc(db, 'pages', p.id));
        const uid = requireUid();
        const gq = query(
            collection(db, 'sectionGroups'),
            where('userId', '==', uid),
            where('notebookId', '==', id)
        );
        const gs = await getDocs(gq);
        for (const g of gs.docs) batch.delete(g.ref);
        batch.delete(doc(db, 'sections', s.id));
    }
    batch.delete(doc(db, 'notebooks', id));
    await batch.commit();
}

// ── Sections (Chapters) ─────────────────────────────────────────────────────

export async function getSections(notebookId, groupId) {
    const uid = requireUid();
    let q;
    if (groupId === undefined) {
        // All chapters for notebook (used by app shell / seed / delete)
        q = query(
            collection(db, 'sections'),
            where('userId', '==', uid),
            where('notebookId', '==', notebookId),
            orderBy('position')
        );
    } else {
        q = query(
            collection(db, 'sections'),
            where('userId', '==', uid),
            where('notebookId', '==', notebookId),
            where('sectionGroupId', '==', groupId),
            orderBy('position')
        );
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createSection(notebookId, title, groupId = null, color = '#5B9BD5') {
    const uid = requireUid();
    const ref = await addDoc(collection(db, 'sections'), {
        userId: uid,
        notebookId, sectionGroupId: groupId, title, color,
        position: Date.now(),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });
    return ref.id;
}

export async function deleteSection(id) {
    const pages = await getPages(id);
    const batch = writeBatch(db);
    for (const p of pages) batch.delete(doc(db, 'pages', p.id));
    batch.delete(doc(db, 'sections', id));
    await batch.commit();
}

// ── Section Groups ──────────────────────────────────────────────────────────

export async function getSectionGroups(notebookId) {
    const uid = requireUid();
    const q = query(
        collection(db, 'sectionGroups'),
        where('userId', '==', uid),
        where('notebookId', '==', notebookId),
        orderBy('position')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Pages ───────────────────────────────────────────────────────────────────

export async function getPages(sectionId) {
    const uid = requireUid();
    const q = query(
        collection(db, 'pages'),
        where('userId', '==', uid),
        where('sectionId', '==', sectionId),
        where('parentPageId', '==', null),
        orderBy('position')
    );
    const snap = await getDocs(q);
    const pages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    for (const p of pages) {
        const sq = query(
            collection(db, 'pages'),
            where('userId', '==', uid),
            where('parentPageId', '==', p.id),
            orderBy('position')
        );
        const ssnap = await getDocs(sq);
        p.subpages = ssnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    return pages;
}

export async function getPage(id) {
    const snap = await getDoc(doc(db, 'pages', id));
    if (!snap.exists()) return null;
    const data = { id: snap.id, ...snap.data() };
    if (data.userId !== requireUid()) return null;
    return data;
}

export async function createPage(sectionId, title = 'Untitled Page', parentPageId = null) {
    const uid = requireUid();
    const ref = await addDoc(collection(db, 'pages'), {
        userId: uid,
        sectionId, parentPageId, title,
        contentJson: '{}', contentPlain: '',
        position: Date.now(), isCollapsed: false, treePath: '',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
    });
    return ref.id;
}

export async function savePage(id, { title, contentJson, contentPlain }) {
    const data = { updatedAt: Timestamp.now() };
    if (title !== undefined) data.title = title;
    if (contentJson !== undefined) data.contentJson = contentJson;
    if (contentPlain !== undefined) data.contentPlain = contentPlain;
    await updateDoc(doc(db, 'pages', id), data);
}

export async function deletePage(id) {
    const uid = requireUid();
    const sq = query(
        collection(db, 'pages'),
        where('userId', '==', uid),
        where('parentPageId', '==', id)
    );
    const subs = await getDocs(sq);
    const batch = writeBatch(db);
    for (const s of subs.docs) batch.delete(s.ref);
    batch.delete(doc(db, 'pages', id));
    await batch.commit();
}

export async function movePage(id, position, sectionId = null, parentPageId = null) {
    const data = { position, updatedAt: Timestamp.now() };
    if (sectionId) data.sectionId = sectionId;
    if (parentPageId !== null) data.parentPageId = parentPageId || null;
    await updateDoc(doc(db, 'pages', id), data);
}

// ── Search ──────────────────────────────────────────────────────────────────

export async function searchPages(searchTerm) {
    const uid = requireUid();
    const term = (searchTerm || '').toLowerCase();
    const q = query(
        collection(db, 'pages'),
        where('userId', '==', uid),
        where('contentPlain', '>=', term),
        where('contentPlain', '<=', term + '\uf8ff'),
        limit(20)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Storage ─────────────────────────────────────────────────────────────────

export async function uploadImage(file) {
    const uid = requireUid();
    const path = `images/${uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// ── Seed ────────────────────────────────────────────────────────────────────

export async function seedIfEmpty() {
    const existing = await getNotebooks();
    if (existing.length) return;

    const uid = requireUid();

    const nbId = await createNotebook('Notebooks');
    await updateDoc(doc(db, 'notebooks', nbId), { color: '#5B9BD5', position: 0 });

    const s1Id = await createSection(nbId, 'Quick Notes', null, '#5B9BD5');
    const s2Id = await createSection(nbId, 'Ideas', null, '#E57373');

    await createPage(s1Id, 'Getting Started');
    await createPage(s1Id, 'Quick Scratchpad');
    await createPage(s2Id, 'Brainstorms');

    const wId = await createNotebook('Work');
    await updateDoc(doc(db, 'notebooks', wId), { color: '#81C784', position: 1 });

    await addDoc(collection(db, 'sectionGroups'), {
        userId: uid,
        notebookId: wId, title: 'Project Alpha', position: 0,
        createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    });

    const sgSnap = await getSectionGroups(wId);
    const sgId = sgSnap[0]?.id || null;

    const s3Id = await createSection(wId, 'Meetings', sgId, '#81C784');
    await createSection(wId, 'Design', sgId, '#FFB74D');
    await createSection(wId, 'Misc', null, '#9575CD');

    await createPage(s3Id, 'Standup Notes');
}
