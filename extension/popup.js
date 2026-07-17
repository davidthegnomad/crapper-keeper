const $ = (id) => document.getElementById(id);

function setStatus(msg) {
    $('status').textContent = msg || '';
}

function sendMessage(payload) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, (resp) => {
            if (chrome.runtime.lastError) {
                resolve({ error: chrome.runtime.lastError.message });
            } else {
                resolve(resp || {});
            }
        });
    });
}

function renderNotebooks(notebooks) {
    const nbSel = $('notebook-select');
    const secSel = $('section-select');

    if (!notebooks || !notebooks.length) {
        nbSel.innerHTML = '<option>No notebooks — open webapp first</option>';
        secSel.innerHTML = '<option>—</option>';
        return;
    }

    nbSel.innerHTML = notebooks.map(nb => `<option value="${nb.id}">${nb.title}</option>`).join('');

    function updateSections(nbId) {
        const nb = notebooks.find(n => n.id === nbId);
        if (!nb?.sections?.length) {
            secSel.innerHTML = '<option>No chapters</option>';
            return;
        }
        secSel.innerHTML = nb.sections.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    }

    nbSel.onchange = () => updateSections(nbSel.value);
    updateSections(nbSel.value);

    chrome.storage.sync.get(['notebookId', 'sectionId'], (prefs) => {
        if (prefs.notebookId) {
            nbSel.value = prefs.notebookId;
            updateSections(nbSel.value);
        }
        if (prefs.sectionId) secSel.value = prefs.sectionId;
    });
}

function showSignedIn(notebooks) {
    $('signed-out').classList.add('hidden');
    $('signed-in').classList.remove('hidden');
    renderNotebooks(notebooks);
}

function showSignedOut(msg) {
    $('signed-in').classList.add('hidden');
    $('signed-out').classList.remove('hidden');
    setStatus(msg || '');
}

async function init() {
    setStatus('Checking sign-in…');
    const resp = await sendMessage({ action: 'init' });
    setStatus('');
    if (resp.signedIn) showSignedIn(resp.notebooks);
    else showSignedOut(resp.error);
}

$('btn-signin').addEventListener('click', async () => {
    const btn = $('btn-signin');
    btn.disabled = true;
    setStatus('Opening Google sign-in…');
    const resp = await sendMessage({ action: 'signIn' });
    btn.disabled = false;
    if (resp.signedIn) {
        setStatus('');
        showSignedIn(resp.notebooks);
    } else {
        setStatus(resp.error || 'Sign-in failed');
    }
});

$('btn-signout').addEventListener('click', async () => {
    await sendMessage({ action: 'signOut' });
    showSignedOut('Signed out');
});

$('btn-save').addEventListener('click', () => {
    const nbId = $('notebook-select').value;
    const secId = $('section-select').value;
    chrome.storage.sync.set({ notebookId: nbId, sectionId: secId }, () => {
        setStatus('Saved \u2713');
        setTimeout(() => setStatus(''), 2000);
    });
});

init();
