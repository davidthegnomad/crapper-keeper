# Crapper Keeper — Chrome Extension

Right-click any webpage to save it directly to your Crapper Keeper notebooks. Syncs with the webapp using the same Firebase project and Google account.

## Install

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. The purple CK icon appears in your toolbar

## Usage

### Right-click to save
- **Any page** → Right-click → "Save to Crapper Keeper" — saves page title + URL
- **Selected text** → Highlight text → Right-click → "Save selection to CK" — saves quoted text + source link
- **An image** → Right-click image → "Save image to CK" — saves image URL
- **A link** → Right-click link → "Save link to CK" — saves link URL + source page

### Configure default notebook
Click the CK icon in your toolbar to choose which notebook and chapter new saves go to.

### Requirements
- Sign into the [Crapper Keeper webapp](https://davidthegnomadorg.web.app/crapper-keeper/) with Google first
- The extension shares your webapp account automatically

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome MV3 config |
| `background.js` | Service worker: context menus, Firebase Auth, Firestore save |
| `popup.html` | Settings popup (pick default notebook/chapter) |
| `popup.js` | Popup logic — loads notebook list from Firestore |
| `icons/` | Purple CK icons (16, 48, 128px) |

## Auth

Uses Firebase Auth (same `davidthegnomadorg` project as the webapp). When you save:
1. Extension checks for your existing Google sign-in session
2. If signed in, saves directly to your Firestore data
3. If not signed in, opens the webapp so you can sign in

No separate login needed — one account across webapp + extension.

## Development

```bash
# To reload after code changes
# Go to chrome://extensions → click refresh icon on the extension card

# Check background script console
# Go to chrome://extensions → click "service worker" link under the extension
```
