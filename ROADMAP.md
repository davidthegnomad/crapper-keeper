# Crapper Keeper Roadmap

**Updated:** 2026-08-14  
**Current milestone:** Markdown/HTML/HTMX page modes shipped (web); native testing still pending

## Completed

- [x] Firebase webapp with per-user Firestore isolation
- [x] Google web authentication
- [x] Manifest V3 Chrome extension implementation
- [x] Vite production bundle with local Firebase and TipTap dependencies
- [x] Capacitor iOS and Android projects
- [x] Firebase iOS and Android app registration
- [x] Native Google authentication bridge
- [x] Sign in with Apple code, entitlement, and iOS UI
- [x] Responsive phone layout and safe-area support
- [x] Firestore autosave correction
- [x] In-app sign-out and account/data deletion
- [x] Privacy policy and owner-only Storage rules
- [x] Successful Vite build and Capacitor sync for both platforms
- [x] Markdown and HTML/HTMX page modes with live preview
- [x] Windows/macOS Electron desktop shell (loads live web app)
- [x] Installable PWA manifest (Edge/Chrome on Windows)

## Milestone 1 — Finish native account configuration

- [ ] Apple Developer: enable Sign in with Apple for
  `com.gnomadstudio.crapperkeeper`
- [ ] Create Apple Sign in key and configure the Apple provider in Firebase
- [ ] Install Android Studio, JDK, and Android SDK 36
- [ ] Generate debug/release signing certificates
- [ ] Add Android SHA-1 and SHA-256 fingerprints to Firebase
- [ ] Download refreshed `google-services.json`
- [ ] Select the Apple development team and provisioning profile in Xcode

## Milestone 2 — Device testing

- [ ] Install an iOS simulator runtime in Xcode
- [ ] Test iPhone and iPad layouts
- [ ] Test Android phone and tablet layouts
- [ ] Verify Google sign-in on iOS and Android
- [ ] Verify Sign in with Apple on iOS
- [ ] Verify notebook/chapter/page creation and autosave
- [ ] Verify image upload and deletion
- [ ] Verify sign-out, session restoration, and account deletion
- [ ] Test slow network, offline errors, keyboard behavior, and large notes
- [ ] Fix all release-blocking defects

## Milestone 3 — Store release preparation

- [ ] Deploy bundled web build, privacy policy, and Storage rules
- [ ] Confirm privacy URL:
  `https://davidthegnomadorg.web.app/crapper-keeper/privacy.html`
- [ ] Produce final iOS and Android app icons/splash assets
- [ ] Capture required phone/tablet screenshots
- [ ] Write short description, full description, keywords, and release notes
- [ ] Complete Apple privacy nutrition labels
- [ ] Complete Google Play Data Safety and content-rating forms
- [ ] Prepare reviewer login instructions
- [ ] Confirm support contact and support URL

## Milestone 4 — Apple App Store submission

- [ ] Create the App Store Connect app record
- [ ] Archive a signed Release build in Xcode
- [ ] Upload build to App Store Connect
- [ ] Run TestFlight internal testing
- [ ] Resolve TestFlight/device findings
- [ ] Complete pricing, availability, age rating, and review information
- [ ] Submit version 1.0 for App Review
- [ ] Address review feedback
- [ ] Release version 1.0 to the App Store

## Milestone 5 — Google Play submission

- [ ] Create the Play Console app record
- [ ] Configure Play App Signing and preserve upload-key backup
- [ ] Build a signed Android App Bundle (`.aab`) targeting API 36
- [ ] Upload to internal testing
- [ ] Complete closed testing if required by the account
- [ ] Resolve testing/pre-launch report findings
- [ ] Complete store listing, countries, pricing, and policy declarations
- [ ] Submit version 1.0 for Google Play review
- [ ] Address review feedback
- [ ] Release version 1.0 to production

## Later

- [x] Render Markdown pages (live preview, GFM)
- [x] Render HTML/HTMX pages (source + HTMX-processed preview)
- [ ] Native share-sheet capture into Crapper Keeper
- [ ] Offline queue and conflict-safe synchronization
- [ ] Native Files/Share export for Markdown
- [ ] Touch drag-and-drop chapter/page reordering
- [ ] Performance profiling for very large TipTap documents
