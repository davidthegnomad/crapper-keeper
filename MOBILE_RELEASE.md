# Crapper Keeper — iOS and Android Release

## App identity

- Display name: **Crapper Keeper**
- Bundle / application ID: `com.gnomadstudio.crapperkeeper`
- Firebase project: `davidthegnomadorg`
- Firebase Android app: `1:987094737269:android:c37402802fffce4ae6f33c`
- Firebase iOS app: `1:987094737269:ios:0fbe022f429df273e6f33c`
- Privacy URL: `https://davidthegnomadorg.web.app/crapper-keeper/privacy.html`
- Support URL: `https://davidthegnomadorg.web.app/crapper-keeper/`

## Architecture

Capacitor packages the same locally bundled Vite app for web, iOS, and Android. Native Firebase Authentication handles Google and Apple login, then signs the Firebase JavaScript layer in with the returned credential so existing Firestore rules and data remain unchanged.

## Commands

```bash
npm install
npm run build

# CocoaPods installed in the user Ruby gem path on this Mac
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
export RUBYOPT="-rlogger"
npm run mobile:sync

npm run mobile:ios
npm run mobile:android
```

## Required account configuration

### Apple / Firebase

1. Apple Developer → Certificates, Identifiers & Profiles → Identifiers.
2. Create or open App ID `com.gnomadstudio.crapperkeeper`.
3. Enable **Sign in with Apple**.
4. Create a Sign in with Apple key (`.p8`) and record its Key ID and Team ID.
5. Firebase Console → Authentication → Sign-in method → Apple.
6. Enable Apple and enter the Service ID / Team ID / Key ID / private key requested by Firebase.
7. In Xcode, select the App target and your Gnomad Studio development team. Confirm the Sign in with Apple capability is present.

`ios/App/App/App.entitlements` and the Google URL scheme are already wired.

### Android / Google sign-in

1. Install Android Studio (includes JDK) and Android SDK 36.
2. Open `android/` in Android Studio and let Gradle create the debug keystore.
3. Run `./gradlew signingReport`.
4. Firebase Console → Project settings → Crapper Keeper Android → add the debug and release SHA-1 and SHA-256 fingerprints.
5. Download the refreshed `google-services.json` and replace `android/app/google-services.json`.

Google sign-in will return `DEVELOPER_ERROR` until the signing SHA is registered.

## Local verification

### iOS

Xcode 26.5 is installed, but an iOS platform/simulator runtime is not. Install one from Xcode → Settings → Components, then:

```bash
npm run mobile:ios
```

Test Google login, Apple login, notebook creation, page editing/autosave, image upload, sign out, and account deletion.

### Android

Install Android Studio/JDK/SDK, register signing SHAs, then:

```bash
npm run mobile:android
```

Test on a real phone and at least one emulator.

## Store compliance checklist

- [ ] Google and Apple buttons have equivalent prominence on iOS.
- [ ] Account deletion removes Firestore documents, uploaded images, and Firebase Auth account.
- [ ] Privacy policy is deployed and entered in both stores.
- [ ] App Review receives a working reviewer account or clear social-login instructions.
- [ ] App icon, screenshots, descriptions, category, content rating, and support contact are supplied.
- [ ] Apple privacy nutrition labels disclose account/contact info and user content.
- [ ] Google Play Data Safety discloses account info and user-generated notes/images.
- [ ] Android closed testing requirement is completed if the Play account requires it.
- [ ] Release builds are signed and tested on physical devices.

## Known setup blockers

- Apple provider credentials are account-side secrets and are not stored in this repo.
- Android signing fingerprints do not exist until Android Studio/JDK creates or imports a keystore.
- This Mac currently lacks an installed iOS simulator runtime and Android Studio/SDK, so native binaries have not yet been executed.
