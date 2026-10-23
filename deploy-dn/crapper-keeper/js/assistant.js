/**
 * Ask box for the desktop app. The local model proposes changes.
 * This page is the only place those changes are applied.
 */

import { getNotebooks, getSections, getPages, getPage } from './firebase-db.js';
import { gateTools, parseAssistantReply } from './assistant-plan.js';
import { executeTools } from './assistant-tools.js';
import { vaultIsUnlocked, vaultTitles } from './vault-session.js';
import { fallbackMinutes, minutesTitle, parseMinutesReply, renderMinutes } from './minutes.js';

function readJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function encodeWav(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const write = (offset, text) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };
    write(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    write(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
    return new Uint8Array(buffer);
}

async function blobToWav(blob) {
    const ctx = new AudioContext();
    try {
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const rate = 16000;
        const length = Math.max(1, Math.ceil(decoded.duration * rate));
        const offline = new OfflineAudioContext(1, length, rate);
        const source = offline.createBufferSource();
        source.buffer = decoded;
        source.connect(offline.destination);
        source.start();
        const rendered = await offline.startRendering();
        return encodeWav(rendered.getChannelData(0), rate);
    } finally {
        ctx.close();
    }
}

async function buildSnapshot() {
    const here = window.ckNotebookState ? window.ckNotebookState() : {};
    const lines = [
        `view: ${here.view || 'notebook'}`,
        `currentNotebookId: ${here.notebookId || ''}`,
        `currentSectionId: ${here.sectionId || ''}`,
        `currentPageId: ${here.pageId || ''}`,
        'notebooks:',
    ];
    const notebooks = await getNotebooks();
    for (const notebook of notebooks.slice(0, 20)) lines.push(`- ${notebook.id} | ${notebook.title || ''}`);
    if (here.notebookId) {
        lines.push('chapters:');
        const sections = await getSections(here.notebookId);
        for (const section of sections.slice(0, 30)) lines.push(`- ${section.id} | ${section.title || ''}`);
    }
    if (here.sectionId) {
        lines.push('pages:');
        const pages = await getPages(here.sectionId);
        const flat = pages.flatMap((page) => [page, ...(page.subpages || [])]);
        for (const page of flat.slice(0, 40)) {
            const bit = String(page.contentPlain || '').replace(/\s+/g, ' ').slice(0, 80);
            lines.push(`- ${page.id} | ${page.title || ''} | ${bit}`);
        }
    }
    if (here.pageId) {
        const page = await getPage(here.pageId);
        if (page) {
            lines.push(`currentPageTitle: ${page.title || ''}`);
            lines.push('currentPageText:');
            lines.push(String(page.contentPlain || page.contentSource || '').slice(0, 2500));
        }
    }
    const slate = readJson('ck-slate');
    lines.push('slate:');
    for (const note of (slate && slate.notes || []).slice(0, 20)) {
        lines.push(`- ${note.id} | ${note.title || ''} | ${String(note.body || '').replace(/\s+/g, ' ').slice(0, 80)}`);
    }
    const stickies = readJson('ck-stickies');
    lines.push('stickies:');
    for (const note of (stickies && stickies.notes || []).slice(0, 20)) {
        lines.push(`- ${note.id} | ${String(note.text || '').replace(/\s+/g, ' ').slice(0, 80)}`);
    }
    const preview = readJson('ck-preview-lab');
    if (preview) lines.push(`previewHtml: ${String(preview.html || '').slice(0, 200)}`);
    lines.push(vaultIsUnlocked() ? 'vault: unlocked' : 'vault: locked');
    for (const item of vaultTitles()) lines.push(`- ${item.id} | ${item.title}`);
    return lines.join('\n').slice(0, 7500);
}

function applyResult(result) {
    if (result.view || result.reloadTools || result.reloadNotebook || result.open) {
        window.dispatchEvent(new CustomEvent('ck-assistant-done', { detail: result }));
    }
}

async function saveMinutesPage(transcript, fields) {
    const body = renderMinutes(fields, transcript);
    const title = minutesTitle();
    const page = { name: 'create_page', args: { title, body, pageMode: 'markdown' } };
    const direct = await executeTools([page]);
    if (direct.lines.some((line) => line.startsWith('Created page'))) return direct;
    return executeTools([
        { name: 'create_notebook', args: { title: 'Voice notes' } },
        { name: 'create_section', args: { title: 'Recordings' } },
        page,
    ]);
}

async function saveTranscript(text) {
    const direct = await executeTools([
        { name: 'create_page', args: { title: 'Voice note', body: text } },
    ]);
    if (direct.lines.some((line) => line.startsWith('Created page'))) return direct;
    return executeTools([
        { name: 'create_notebook', args: { title: 'Voice notes' } },
        { name: 'create_section', args: { title: 'Recordings' } },
        { name: 'create_page', args: { title: 'Voice note', body: text } },
    ]);
}

export function mountAssistant() {
    if (!window.ckDesktop || document.getElementById('btn-ask')) return;
    const bar = document.querySelector('.title-bar');
    const anchor = document.getElementById('btn-dark-mode');
    if (!bar) return;

    const btn = document.createElement('button');
    btn.id = 'btn-ask';
    btn.type = 'button';
    btn.className = 'view-menu-btn';
    btn.textContent = 'Ask';
    btn.title = 'Ask the on-device assistant to change notes';
    bar.insertBefore(btn, anchor || null);

    const panel = document.createElement('section');
    panel.id = 'ask-panel';
    panel.className = 'ck-ask-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'On-device assistant');

    const head = document.createElement('div');
    head.className = 'ck-ask-head';
    const title = document.createElement('strong');
    title.textContent = 'Ask';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Close';
    head.append(title, close);

    const banner = document.createElement('p');
    banner.className = 'ck-ask-banner';
    banner.hidden = true;
    const setup = document.createElement('button');
    setup.type = 'button';
    setup.textContent = 'Set up';
    banner.append(document.createTextNode('The on-device model is not installed yet. '), setup);

    const log = document.createElement('div');
    log.className = 'ck-ask-log';
    const status = document.createElement('p');
    status.className = 'ck-ask-status';
    status.setAttribute('aria-live', 'polite');

    const chips = document.createElement('div');
    chips.className = 'ck-ask-chips';
    const tidy = document.createElement('button');
    tidy.type = 'button';
    tidy.textContent = 'Tidy this page';
    const sticky = document.createElement('button');
    sticky.type = 'button';
    sticky.textContent = 'Summarize onto a sticky';
    chips.append(tidy, sticky);

    const input = document.createElement('textarea');
    input.className = 'ck-ask-input';
    input.rows = 3;
    input.placeholder = 'Ask to rename a page, add a sticky, change Preview, or delete a note';

    const row = document.createElement('div');
    row.className = 'ck-ask-row';
    const record = document.createElement('button');
    record.type = 'button';
    record.textContent = 'Record';
    const minutesBtn = document.createElement('button');
    minutesBtn.type = 'button';
    minutesBtn.textContent = 'Minutes';
    minutesBtn.title = 'Record a meeting and save minutes';
    const send = document.createElement('button');
    send.type = 'button';
    send.textContent = 'Send';
    row.append(record, minutesBtn, send);
    const apiLine = document.createElement('p');
    apiLine.className = 'ck-ask-status';
    panel.append(head, banner, log, chips, input, row, apiLine, status);
    document.body.appendChild(panel);

    let busy = false;
    let recorder = null;
    let recordStream = null;
    let chunks = [];
    let recordKind = 'note';

    function say(text) {
        status.textContent = text || '';
    }

    function addLog(text) {
        const line = document.createElement('p');
        line.textContent = text;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
    }

    async function refreshBanner() {
        try {
            const models = await window.ckDesktop.modelsStatus();
            banner.hidden = Boolean(models.ready);
        } catch {
            banner.hidden = true;
        }
    }

    async function ensureModel() {
        const models = await window.ckDesktop.modelsStatus();
        if (models.ready) return true;
        await window.ckDesktop.openSetup();
        say('Download the notes model before asking. Nothing runs until you choose Download.');
        return false;
    }

    function confirmDeletes(tools) {
        const heavy = tools.filter((tool) => tool.name === 'delete_notebook' || tool.name === 'delete_section');
        const secrets = tools.filter((tool) => tool.name === 'delete_secret');
        const all = tools.filter((tool) => tool.name.startsWith('delete_'));
        if (!all.length) return tools;
        if (secrets.length || heavy.length || all.length > 1) {
            const message = secrets.length
                ? 'The assistant wants to delete something in the vault. Continue?'
                : heavy.length
                    ? 'The assistant wants to delete a chapter or a whole notebook. Continue?'
                    : `The assistant wants to delete ${all.length} items. Continue?`;
            if (!window.confirm(message)) {
                addLog('Delete was skipped.');
                return tools.filter((tool) => !tool.name.startsWith('delete_'));
            }
        }
        return tools;
    }

    async function runAsk(message, opts = {}) {
        const text = String(message || '').trim();
        if (!text || busy) return;
        if (!(await ensureModel())) return;
        busy = true;
        send.disabled = true;
        say('Thinking…');
        try {
            if (window.ckFlush) await window.ckFlush();
            const snapshot = await buildSnapshot();
            const reply = await window.ckDesktop.ask({ message: text, snapshot });
            if (!reply || !reply.ok) {
                if (reply && reply.needsSetup) await window.ckDesktop.openSetup();
                say((reply && reply.error) || 'The notes model did not answer.');
                return;
            }
            const parsed = parseAssistantReply(reply.text);
            const gated = gateTools(parsed.tools, text);
            if (gated.blocked.length) addLog('Ignored a delete the request did not ask for.');
            const tools = confirmDeletes(gated.tools);
            if (tools.length || opts.fallbackTranscript) {
                if (window.ckFlush) await window.ckFlush();
                if (window.ckDisarmSave) window.ckDisarmSave();
            }
            const result = await executeTools(tools);
            if (opts.fallbackTranscript && !result.lines.some((line) => line.startsWith('Created page') || line.startsWith('Updated page'))) {
                const saved = await saveTranscript(opts.fallbackTranscript);
                result.lines.push(...saved.lines);
                result.view = saved.view || result.view;
                result.open = saved.open || result.open;
                result.reloadNotebook = result.reloadNotebook || saved.reloadNotebook;
                result.reloadTools = result.reloadTools || saved.reloadTools;
            }
            if (parsed.say) addLog(parsed.say);
            for (const line of result.lines) addLog(line);
            if (!parsed.say && !result.lines.length) addLog('Nothing was changed.');
            applyResult(result);
            say('Done.');
        } catch (err) {
            say(err.message || 'That request did not finish.');
        } finally {
            busy = false;
            send.disabled = false;
        }
    }

    function resetRecordButtons() {
        record.textContent = 'Record';
        minutesBtn.textContent = 'Minutes';
    }

    async function stopRecording() {
        if (recorder && recorder.state === 'recording') recorder.stop();
    }

    async function beginRecording(kind) {
        if (recorder && recorder.state === 'recording') {
            resetRecordButtons();
            await stopRecording();
            return;
        }
        if (busy) return;
        const models = await window.ckDesktop.modelsStatus();
        if (!models.whisper) {
            if (models.includesSpeech) await window.ckDesktop.openSetup();
            say(models.includesSpeech
                ? 'Download the speech model before recording. Nothing records until you choose Download.'
                : 'Voice notes are not available on this Mac yet. You can still ask it to change notes.');
            return;
        }
        try {
            recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            say('The microphone is blocked.');
            return;
        }
        recordKind = kind;
        chunks = [];
        recorder = new MediaRecorder(recordStream);
        recorder.addEventListener('dataavailable', (event) => {
            if (event.data && event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener('stop', async () => {
            const kindNow = recordKind;
            resetRecordButtons();
            recordStream.getTracks().forEach((track) => track.stop());
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            say('Transcribing…');
            try {
                const wav = await blobToWav(blob);
                const heard = await window.ckDesktop.transcribe(wav);
                if (!heard || !heard.ok) {
                    if (heard && heard.needsSetup) await window.ckDesktop.openSetup();
                    say((heard && heard.error) || 'The recording could not be transcribed.');
                    return;
                }
                addLog(`Heard: ${heard.text}`);
                if (kindNow === 'minutes') {
                    say('Writing minutes…');
                    const reply = await window.ckDesktop.minutes(heard.text);
                    const fields = reply && reply.ok
                        ? parseMinutesReply(reply.text, heard.text)
                        : fallbackMinutes(heard.text);
                    if (!reply || !reply.ok) {
                        if (reply && reply.needsSetup) await window.ckDesktop.openSetup();
                        addLog('Saved the transcript under Discussion. The notes model did not format the rest.');
                    }
                    if (window.ckFlush) await window.ckFlush();
                    if (window.ckDisarmSave) window.ckDisarmSave();
                    const result = await saveMinutesPage(heard.text, fields);
                    for (const line of result.lines) addLog(line);
                    applyResult(result);
                    say('Done.');
                    return;
                }
                await runAsk(
                    `Save this transcript as a new page in the current chapter. Give it a short title and tidy the wording. Do not delete anything.\n\nTranscript:\n${heard.text.slice(0, 6000)}`,
                    { fallbackTranscript: heard.text }
                );
            } catch (err) {
                say(err.message || 'The recording could not be transcribed.');
            }
        });
        recorder.start();
        if (kind === 'minutes') minutesBtn.textContent = 'Stop';
        else record.textContent = 'Stop';
        say(kind === 'minutes'
            ? 'Listening for minutes… click Stop when the meeting is done.'
            : 'Listening… click Stop when you are done.');
        setTimeout(() => {
            if (recorder && recorder.state === 'recording') recorder.stop();
        }, 10 * 60 * 1000);
    }

    record.addEventListener('click', () => beginRecording('note'));
    minutesBtn.addEventListener('click', () => beginRecording('minutes'));

    send.addEventListener('click', () => {
        const message = input.value;
        input.value = '';
        runAsk(message);
    });
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send.click();
        }
    });
    tidy.addEventListener('click', () => {
        if (!window.ckNotebookState || !window.ckNotebookState().pageId) {
            say('Open a page first.');
            return;
        }
        runAsk('Rewrite the current page so it is clearer. Keep the meaning. Update that page. Do not delete anything.');
    });
    sticky.addEventListener('click', () => {
        if (!window.ckNotebookState || !window.ckNotebookState().pageId) {
            say('Open a page first.');
            return;
        }
        runAsk('Add one sticky note that summarizes the current page. Do not change the page and do not delete anything.');
    });
    setup.addEventListener('click', () => window.ckDesktop.openSetup());
    close.addEventListener('click', () => { panel.hidden = true; });
    async function showApi() {
        if (!window.ckDesktop.apiInfo) return;
        try {
            const info = await window.ckDesktop.apiInfo();
            if (!info || !info.baseUrl || !info.token) return;
            apiLine.replaceChildren();
            apiLine.append(`Local tool API ${info.baseUrl} `);
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.textContent = 'Copy token';
            copy.addEventListener('click', async () => {
                await navigator.clipboard.writeText(info.token);
                say('Token copied. It stays on this computer.');
            });
            apiLine.append(copy);
        } catch {
            apiLine.textContent = '';
        }
    }

    btn.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
            refreshBanner();
            showApi();
            input.focus();
        }
    });
    panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') panel.hidden = true;
    });
    window.ckDesktop.onProgress((data) => {
        if (data && data.done) refreshBanner();
    });
    refreshBanner();
}
