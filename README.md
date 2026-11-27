# Bioform

A mobile-first Vue 3 app with account registration, sign-in, and a personal
home page. User records are stored in a local SQL.js database on this device.

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`; run focused checks with
`npm test`.

## GitHub Pages

The `Deploy to GitHub Pages` workflow builds and publishes the app when changes
are pushed to `main` (or started manually). It configures Vite's base path from
the repository name, and adds a `404.html` fallback for GitHub Pages. The
current app uses in-page state rather than URL routes, but the fallback also
supports future client-side routes. The app requires no server API; all account
data remains local to each browser.

Enable **Settings → Pages → Build and deployment → GitHub Actions** in the
target repository. Desktop biometric unlock requires HTTPS; GitHub Pages
provides HTTPS automatically.

## Device-local unlock

After password registration or sign-in, supported packaged mobile apps can
opt in to biometric unlock. Capacitor stores a random resumable credential in
the iOS Keychain or Android Keystore and requires fresh OS authentication for
each read. Supported browsers use WebAuthn in a secure context: Android's
platform authenticator (fingerprint, face, or screen lock), or iOS Safari's
passkey prompt (Face ID, Touch ID, or device passcode). Windows Hello, macOS
Touch ID, or supported Linux platform/FIDO2 authenticators are also available.
The browser signs a fresh challenge that Bioform verifies locally. Only public
enrollment metadata is stored in app preferences; the browser or authenticator
holds the private key.

Password sign-in remains available for enrollment, fallback, and password
re-authentication to disable unlock. Turning off WebAuthn unlock removes
Bioform's local public-key registration; the OS/browser may keep its passkey
until removed separately. Passkey providers may sync credentials according to
their own settings. Linux biometric and FIDO2 support varies by distribution,
desktop environment, browser, and hardware; availability is confirmed by
actual WebAuthn operations, not simulated.

Browser unlock requires WebAuthn support and a secure origin (`localhost` or
HTTPS). Android Chrome and recent iOS Safari use the browser's platform
authenticator when available; otherwise password sign-in remains available.
In Safari this is a WebAuthn passkey flow, not native-app Face ID access.
Passkey sync is controlled by the browser or credential provider. Run
`npm run cap:sync` to build and sync the web app and Capacitor plugins to the
generated iOS/Android projects. Native platform builds still require their
platform toolchains (Xcode on macOS for iOS and Java 21/Android tooling for
Android).

Passwords are salted and hashed with PBKDF2 before being written to SQLite.
This starter is a local-only demo, not a production authentication service:
browser storage can be cleared or inspected by someone with access to the
device, browser unlock is verified locally without a backend, and accounts do
not sync across devices.
