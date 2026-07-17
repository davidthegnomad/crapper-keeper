# Learning Log — Crapper Keeper

## 2026-07-17: Firebase Migration + Auth + Extension

### Firebase API key handling
- Firebase CLI always masks the apiKey in output — get it from Firebase Console → Project Settings → General
- The key is a public browser key, safe to embed in client code
- When patching files, literal `...` dots can't be replaced by the fuzzy matcher — use Python with exact string matching
- Always verify with `len(key) > 20` — real keys are 39 chars, placeholders are 13

### Module loading order
- ES modules (`<script type="module">`) load AFTER `DOMContentLoaded` fires
- Use `document.readyState === 'loading'` check instead of `addEventListener('DOMContentLoaded')`
- For click handlers that must work immediately, use `onclick` attribute + global function
- Firebase Auth compat SDK (non-module) loads before HTML renders — use it for sign-in buttons

### Firestore composite indexes
- Any query with multiple `where()` + `orderBy()` needs a composite index
- Deploy via `firestore.indexes.json` — must be referenced in `firebase.json` or `firebase-dn.json`
- Build time: ~2 minutes
- Use `firebase firestore:indexes` to verify deployment

### Firebase Hosting subdirectory deploy
- Use `--config firebase-dn.json` to avoid overwriting main site
- Public directory: `deploy-dn/crapper-keeper/`
- All asset paths must be absolute: `/crapper-keeper/js/app.js`

### Per-user data isolation
- Add `userId` field to every Firestore document
- Firestore rules: `request.auth.uid == resource.data.userId`
- Every query must include `where('userId', '==', uid())`

### Chrome extension auth
- Shares Firebase project with webapp — picks up Google Auth session
- Use `importScripts()` for Firebase compat SDKs in service worker
- `chrome.action.setBadgeText()` for save confirmation
- No OAuth client ID needed for anonymous auth fallback
