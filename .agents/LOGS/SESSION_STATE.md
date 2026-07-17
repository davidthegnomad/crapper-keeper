# Session State — Crapper Keeper

**Last Updated:** 2026-07-17 15:27 CDT
**Current Phase:** Native configuration and device testing

## Project Status

- ✅ Firebase webapp with Google Auth and per-user Firestore isolation
- ✅ Chrome MV3 extension rewritten with independent Google/Firebase auth
- ✅ Vite production bundle; Firebase and TipTap no longer execute from CDNs
- ✅ Capacitor iOS and Android projects (`com.gnomadstudio.crapperkeeper`)
- ✅ Native Firebase apps registered and platform config files added
- ✅ Native Google credential bridge and Sign in with Apple implementation
- ✅ Responsive mobile layout, safe areas, and touch-size controls
- ✅ Firestore autosave repaired
- ✅ Sign-out and account/data deletion
- ✅ Privacy policy and Storage rules authored
- ⏳ Native runtime testing and store submission

## Session Chronicle — 2026-07-17

### Google web sign-in repair
- Found `app.js` importing auth helpers absent from `firebase-db.js`
- Added Auth helpers, user-scoped CRUD, authorized-domain verification, and
  COOP header support
- Verified Google provider enabled for `davidthegnomadorg`
- Deployed the web/auth repair earlier in the session

### Chrome extension review and repair
- Found two blockers: Manifest V3 remote `importScripts()` and invalid
  assumption that extension and web origins share Firebase sessions
- Replaced SDK-dependent worker with `chrome.identity` + Firebase/Firestore REST
- Pinned extension ID `bnphbmoakfepbbofcccekiainldenffm`
- Documented OAuth redirect:
  `https://bnphbmoakfepbbofcccekiainldenffm.chromiumapp.org/`
- User added the redirect URI in Google Cloud Console

### iOS and Android conversion
- Installed Capacitor 7, Firebase Authentication plugin, Firebase 11, Vite,
  and all required TipTap extensions
- Added `ios/`, `android/`, `capacitor.config.json`, and Vite build scripts
- Registered Firebase Android/iOS apps and downloaded both native configs
- Added iOS Google callback scheme and Apple Sign In entitlement
- Added Android API 36 target for the August 2026 Play requirement
- Added native Google/Apple → Firebase JS credential bridging
- Added account settings, deletion cascade, mobile responsive CSS, and privacy
- Installed CocoaPods 1.15.2 in the user Ruby gem path

### Verification
- `npm run build` succeeds
- `npm run mobile:sync` succeeds for iOS and Android
- `npx cap doctor` reports both projects healthy
- JSON and Apple plist validation pass
- IDE diagnostics report no errors
- Native binary execution was not possible: no Android Studio/JDK/SDK and no
  installed Xcode iOS runtime

## Deployment

- **Live web:** https://davidthegnomadorg.web.app/crapper-keeper/
- **Firebase project:** `davidthegnomadorg`
- **Web deploy:** `npm run deploy:web`
- **Native sync:** `npm run mobile:sync`
- The new Vite web bundle, privacy policy, and Storage rules are not yet
  deployed; deploy after device/browser regression testing

## Key Files

- `deploy-dn/crapper-keeper/` — shared web/mobile source
- `dist/crapper-keeper/` — generated bundle (gitignored)
- `ios/`, `android/` — native projects
- `MOBILE_RELEASE.md` — native configuration and compliance runbook
- `ROADMAP.md` — testing and store submission roadmap
- `BUILD_LOG.md` — implementation history
- `extension/` — Chrome extension
- `app/` — legacy FastAPI prototype; not the store-app source

## Current Blockers

- Firebase Apple provider is not configured; needs Apple Team ID, Key ID,
  Service ID, and `.p8` private key
- Android Google sign-in needs debug/release SHA-1 and SHA-256 fingerprints
- Android Studio/JDK/SDK 36 are not installed
- Xcode lacks an installed iOS platform/simulator runtime
- iOS/Android builds have not been executed on a device

## Next Steps

1. Complete Apple/Firebase and Android signing configuration
2. Install native toolchains/runtimes
3. Execute the device-test matrix in `ROADMAP.md`
4. Deploy the tested web bundle, privacy policy, and Storage rules
5. Prepare assets/listings and submit TestFlight + Play internal builds
