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
- Firebase sessions are origin-scoped: a Chrome extension cannot reuse the
  webapp's IndexedDB Auth session
- Manifest V3 forbids remotely hosted executable code and remote
  `importScripts()` in the service worker
- Use `chrome.identity.launchWebAuthFlow`, exchange the Google token through
  Identity Toolkit, and call Firestore REST with the Firebase ID token
- `chrome.action.setBadgeText()` for save confirmation
- Pin a development extension ID with a manifest `key` before registering the
  `https://<extension-id>.chromiumapp.org/` redirect URI

## 2026-07-17: Capacitor iOS + Android Conversion

### Shared build
- Use Vite to bundle Firebase, TipTap, and app code locally; native store builds
  should not depend on importmaps or remotely hosted executable JavaScript
- Relative asset paths plus Vite `base: './'` allow one build to work in
  Firebase's `/crapper-keeper/` subdirectory and the Capacitor WebView root
- Keep `deploy-dn/crapper-keeper/` as source and `dist/crapper-keeper/` as the
  generated web/native artifact

### Native Firebase authentication
- Web `signInWithPopup` is not a reliable native WebView auth strategy
- `@capacitor-firebase/authentication` obtains native Google/Apple credentials
- Pass `skipNativeAuth: true`, then sign the Firebase JavaScript layer in with
  `signInWithCredential`; this preserves existing Firestore rules and UIDs
- Sign in with Apple requires an iOS entitlement plus Firebase provider setup
  using Apple Team ID, Key ID, Service ID, and `.p8` key
- Android Google sign-in requires SHA-1/SHA-256 fingerprints for each signing
  certificate; missing fingerprints typically surface as `DEVELOPER_ERROR`

### Store compliance
- Apple requires an equivalent privacy-preserving login when Google login is
  offered; showing Sign in with Apple on iOS is the direct compliance path
- Apps supporting account creation must provide in-app account deletion
- Deletion must remove user-owned Firestore documents and Storage objects, not
  only the Firebase Auth record
- Keep privacy policy, account deletion behavior, and store data disclosures
  synchronized

### Toolchain
- This Mac's system Ruby 2.6 required pinned compatible gems before CocoaPods
  1.15.2 could install
- `RUBYOPT=-rlogger` avoids ActiveSupport's Logger constant error under that
  Ruby; the npm `mobile:sync` script includes the working environment
- Capacitor 7 matches the installed Node 20 runtime; Capacitor 8 requires a
  newer Node toolchain
- Google Play requires target API 36 for new submissions beginning
  August 31, 2026
