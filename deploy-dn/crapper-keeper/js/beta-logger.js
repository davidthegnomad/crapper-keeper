/**
 * Beta diagnostic logger — ring buffer of actions + errors for crash reports.
 * Stored in localStorage; exportable from the login screen.
 */

const STORAGE_KEY = 'ck-beta-log-v1';
const MAX_ENTRIES = 200;
const MAX_STORED_CHARS = 120_000;

/** @type {{ t: string, level: string, event: string, detail?: string }[]} */
let entries = [];
let installed = false;

function nowIso() {
    try {
        return new Date().toISOString();
    } catch {
        return String(Date.now());
    }
}

function safeDetail(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value.slice(0, 2000);
    try {
        if (value instanceof Error) {
            return `${value.name}: ${value.message}\n${value.stack || ''}`.slice(0, 4000);
        }
        return JSON.stringify(value).slice(0, 2000);
    } catch {
        return String(value).slice(0, 2000);
    }
}

function persist() {
    try {
        let raw = JSON.stringify(entries);
        while (raw.length > MAX_STORED_CHARS && entries.length > 20) {
            entries = entries.slice(Math.floor(entries.length / 3));
            raw = JSON.stringify(entries);
        }
        localStorage.setItem(STORAGE_KEY, raw);
    } catch {
        /* quota / private mode — keep in-memory only */
    }
}

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed.slice(-MAX_ENTRIES);
    } catch {
        entries = [];
    }
}

export function betaLog(event, detail, level = 'info') {
    entries.push({
        t: nowIso(),
        level,
        event: String(event || 'event').slice(0, 120),
        detail: safeDetail(detail),
    });
    if (entries.length > MAX_ENTRIES) {
        entries = entries.slice(-MAX_ENTRIES);
    }
    persist();
    if (level === 'error') {
        try {
            console.error('[ck-beta]', event, detail);
        } catch { /* ignore */ }
    }
}

export function betaAction(event, detail) {
    betaLog(event, detail, 'action');
}

export function betaError(event, detail) {
    betaLog(event, detail, 'error');
}

export function getBetaReport() {
    const platform = typeof document !== 'undefined'
        ? (document.body?.dataset?.platform || 'unknown')
        : 'unknown';
    let version = 'unknown';
    try {
        version = String(__APP_VERSION__);
    } catch {
        version = '1.1.0';
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const href = typeof location !== 'undefined' ? location.href : '';

    const lines = [
        '=== Crapper Keeper beta report ===',
        `time: ${nowIso()}`,
        `version: ${version}`,
        `platform: ${platform}`,
        `url: ${href}`,
        `ua: ${ua}`,
        `entries: ${entries.length}`,
        '--- log ---',
        ...entries.map((e) => {
            const d = e.detail ? ` | ${e.detail.replace(/\s+/g, ' ').trim()}` : '';
            return `${e.t} [${e.level}] ${e.event}${d}`;
        }),
        '=== end ===',
    ];
    return lines.join('\n');
}

export async function copyBetaReport() {
    const report = getBetaReport();
    betaAction('beta_report_copied', { chars: report.length });
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        return true;
    }
    const ta = document.createElement('textarea');
    ta.value = report;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
}

export function clearBetaLog() {
    entries = [];
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    betaAction('beta_log_cleared');
}

/** Install global handlers once (safe to call multiple times). */
export function installBetaLogger() {
    if (installed) return;
    installed = true;
    load();
    betaAction('session_start', {
        href: typeof location !== 'undefined' ? location.href : '',
        tauri: !!(typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)),
    });

    window.addEventListener('error', (ev) => {
        betaError('window_error', {
            message: ev.message,
            source: ev.filename,
            line: ev.lineno,
            col: ev.colno,
            stack: ev.error?.stack,
        });
    });

    window.addEventListener('unhandledrejection', (ev) => {
        betaError('unhandled_rejection', ev.reason);
    });

    const origError = console.error.bind(console);
    console.error = (...args) => {
        try {
            betaError('console_error', args.map(safeDetail).join(' | '));
        } catch { /* ignore */ }
        origError(...args);
    };
}
