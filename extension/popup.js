// Load notebooks from background
chrome.runtime.sendMessage({ action: 'getNotebooks' }, (data) => {
    const nbSel = document.getElementById('notebook-select');
    const secSel = document.getElementById('section-select');

    if (data?.error) {
        nbSel.innerHTML = '<option>' + data.error + '</option>';
        return;
    }
    if (!data?.length) {
        nbSel.innerHTML = '<option>No notebooks — open webapp first</option>';
        return;
    }

    nbSel.innerHTML = data.map(nb => `<option value="${nb.id}">${nb.title}</option>`).join('');

    // Populate sections for first notebook
    function updateSections(nbId) {
        const nb = data.find(n => n.id === nbId);
        if (!nb?.sections?.length) {
            secSel.innerHTML = '<option>No chapters</option>';
            return;
        }
        secSel.innerHTML = nb.sections.map(s => `<option value="${s.id}">${s.title}</option>`).join('');
    }
    nbSel.onchange = () => updateSections(nbSel.value);
    updateSections(nbSel.value);

    // Load saved prefs
    chrome.storage.sync.get(['notebookId', 'sectionId'], (prefs) => {
        if (prefs.notebookId) nbSel.value = prefs.notebookId;
        if (prefs.sectionId) secSel.value = prefs.sectionId;
    });
});

document.getElementById('btn-save').addEventListener('click', () => {
    const nbId = document.getElementById('notebook-select').value;
    const secId = document.getElementById('section-select').value;
    chrome.storage.sync.set({ notebookId: nbId, sectionId: secId }, () => {
        document.getElementById('status').textContent = 'Saved ✓';
        setTimeout(() => document.getElementById('status').textContent = '', 2000);
    });
});
