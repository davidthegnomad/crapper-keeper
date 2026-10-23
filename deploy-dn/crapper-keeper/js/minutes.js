/**
 * Minutes page. The model may only keep words that appear in the transcript.
 */

const HEADINGS = ['Attendees', 'Discussion', 'Decisions', 'Action items'];

export function minutesTitle(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `Minutes ${y}-${m}-${d}`;
}

export function minutesPrompt(transcript) {
    return [
        'Turn this transcript into meeting minutes.',
        'Use only words and names that appear in the transcript. Do not invent people, votes, or decisions.',
        'Reply with one JSON object: {"attendees":"","discussion":"","decisions":"","actions":[{"who":"","what":"","when":""}]}.',
        'If a section was not discussed, use an empty string.',
        '',
        'TRANSCRIPT:',
        String(transcript || '').slice(0, 12000),
    ].join('\n');
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
            if (depth === 0) {
                try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; }
            }
        }
    }
    return null;
}

export function groundText(text, transcript) {
    const source = String(transcript || '').toLowerCase();
    const kept = String(text || '').split('\n').map((line) => line.trim()).filter((line) => {
        if (!line || /^none noted\.?$/i.test(line)) return false;
        const words = line.toLowerCase().match(/[a-z0-9']{3,}/g) || [];
        if (!words.length) return false;
        const hits = words.filter((word) => source.includes(word));
        return hits.length >= Math.min(2, words.length) && hits.length / words.length >= 0.5;
    });
    return kept.join('\n').trim() || 'None noted.';
}

function groundAction(action, transcript) {
    const who = groundText(action && action.who, transcript);
    const what = groundText(action && action.what, transcript);
    const when = groundText(action && action.when, transcript);
    if (what === 'None noted.') return null;
    const parts = [
        who !== 'None noted.' ? who : '',
        what,
        when !== 'None noted.' ? when : '',
    ].filter(Boolean);
    return `- [ ] ${parts.join(' — ')}`;
}

export function parseMinutesReply(text, transcript) {
    const obj = extractJson(text) || {};
    const actions = Array.isArray(obj.actions) ? obj.actions : [];
    return {
        attendees: groundText(obj.attendees, transcript),
        discussion: groundText(obj.discussion, transcript),
        decisions: groundText(obj.decisions, transcript),
        actions: actions.map((action) => groundAction(action, transcript)).filter(Boolean),
    };
}

export function fallbackMinutes(transcript) {
    const text = String(transcript || '').trim();
    return {
        attendees: 'None noted.',
        discussion: text || 'None noted.',
        decisions: 'None noted.',
        actions: [],
    };
}

export function renderMinutes(fields, transcript) {
    const actions = fields.actions && fields.actions.length
        ? fields.actions.join('\n')
        : 'None noted.';
    return [
        `## ${HEADINGS[0]}`,
        '',
        fields.attendees || 'None noted.',
        '',
        `## ${HEADINGS[1]}`,
        '',
        fields.discussion || 'None noted.',
        '',
        `## ${HEADINGS[2]}`,
        '',
        fields.decisions || 'None noted.',
        '',
        `## ${HEADINGS[3]}`,
        '',
        actions,
        '',
        '## Transcript',
        '',
        String(transcript || '').trim(),
        '',
    ].join('\n');
}
