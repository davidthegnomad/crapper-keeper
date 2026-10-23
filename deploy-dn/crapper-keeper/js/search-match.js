/** Case-insensitive substring match on title or body. */
export function pageMatchesQuery(page, searchTerm) {
    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) return false;
    const title = String(page?.title || '').toLowerCase();
    const body = String(page?.contentPlain || '').toLowerCase();
    return title.includes(term) || body.includes(term);
}
