# Over-the-air updates (expo-updates), found the expensive way

Cross-cutting notes for putting `expo-updates` on a BARE Expo app (one with
`ios/` and `android/` in the repo, no config plugins running at build time),
and for the second update channel you need when a device has no app store.
Every entry below cost a failed build, a silent no-op, or an hour.

The shape of the thing: an update carries JavaScript and assets, nothing
native. A **runtime version** decides which binaries may receive which update,
and getting that value wrong is silent in both directions. Most of the pain
lives there.

## Use the fingerprint runtime version, never a string you bump by hand

**Symptom (the one you are avoiding).** A JavaScript update calls a native
module the installed binary does not contain. Every device that takes the
update crashes on launch.

**Mechanism.** `expo-updates` only delivers an update to a binary whose
runtime version matches. With a hand-maintained string, a human has to
remember to bump it on every native change. Ours added native modules in three
builds out of five; one forgotten bump ships a crash to everyone.

**Fix.** `runtimeVersion: {policy: "fingerprint"}` in app config. The version
becomes a hash of everything native (the `ios/` and `android/` trees, native
dependencies, patches), so adding a module moves it by itself and the
incompatible update is simply never delivered.

In a bare project the native side needs the sentinel, not a literal:

```xml
<!-- ios/<App>/Supporting/Expo.plist -->
<key>EXUpdatesRuntimeVersion</key><string>file:fingerprint</string>
```
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<meta-data android:name="expo.modules.updates.EXPO_RUNTIME_VERSION"
           android:value="file:fingerprint" />
```

That tells the runtime to read the fingerprint the build step wrote
(`EXUpdates.bundle/fingerprint` on iOS via the pod's script phase,
`assets/fingerprint` on Android via the gradle plugin). No Xcode build phase
edits are needed.

## The fingerprint is computed twice, and generated files break the match

**Symptom.** EAS Build fails the "Configure expo-updates" phase with "Runtime
version calculated on local machine not equal to runtime version calculated
during build". Or, worse, no failure at all: you publish updates for months
and no device ever takes one.

**Mechanism.** The hash is computed inside the build and again on your machine
at publish time. Anything that exists in one tree and not the other, or
differs between them, produces two versions. In our case none of the causes
were source:

| Cause | Why the trees differ |
|---|---|
| A hand-written `Expo.plist` | EAS regenerates it from app config before archiving, so the file it hashed is not the file you wrote |
| `ios/Podfile.lock` | `pod install` writes different SPEC CHECKSUMS for podspecs it generates or patches (hermes-engine, and anything that downloads during install) |
| A dependency's downloaded blob | one of ours pulls ~100 MB of OpenSSL into its own package directory at pod install, present only on a machine that has run it |
| `android/.kotlin/sessions` | Kotlin daemon lock files exist only WHILE a build runs, and the fingerprint task runs mid-build |

**Fix.** Keep native config GENERATED, not hand-edited: put the channel and
URL in app config and run
`npx expo-updates configuration:syncnative --platform ios --workflow generic`
so the build's own rewrite is a no-op. Everything else goes in
`.fingerprintignore`, one line per cause with the reason written next to it,
because the next person will otherwise delete lines they cannot justify.

Note the Android manifest is all-or-nothing: `configuration:syncnative
--platform android` rewrites the whole file and strips every comment. If that
file carries permission rationale, keep it hand-written and matched to the
generator's output, and say so in a comment.

## Diff the sources; do not guess which file moved

**Fix.** Keep the build tree and compare the two source lists directly:

```sh
EAS_LOCAL_BUILD_SKIP_CLEANUP=1 EAS_LOCAL_BUILD_WORKINGDIR=/tmp/b \
  npx eas build --platform ios --profile production --local
npx expo-updates fingerprint:generate --platform ios --debug   # in each tree
```

Each entry is `{type, filePath, hash}`; the ones that differ name the files.
Two gotchas while comparing: EAS edits `Info.plist` (build number) and the
pbxproj (provisioning) AFTER hashing, so revert those two in the kept tree
before diffing, and give the kept tree a real `node_modules` or every
directory source reads as missing.

After every build, prove the artifact agrees with the tree it came from:

```sh
unzip -p build.ipa 'Payload/*.app/EXUpdates.bundle/fingerprint'; echo
unzip -p app-release.apk assets/fingerprint; echo
```

## Publish the update BEFORE bumping the next build number

**Symptom.** You fix a bug in JavaScript, publish, and the device that has the
bug never receives it. No error anywhere.

**Mechanism.** The fingerprint hashes the whole `android/` and `ios/` trees,
and `versionCode` lives in `android/app/build.gradle`. Bumping it for the next
build changes the runtime version. We proved it by flipping that one line:
`versionCode 15` gave `8481840c...` (the shipped build's own value) and
`versionCode 16` gave `860c4b6f...`.

**Fix.** Publish the update for a shipped build from THAT build's tree (check
out its commit), or accept that the fix ships as a new build. Ordering matters
more than it looks: bump last, not first.

## Two small ones that cost a cycle each

- `eas update` in `--non-interactive` mode also requires `--environment`
  (`production`), or it exits with a flag error after doing the work of
  exporting the bundle.
- An update is fetched in the background and applied on the NEXT cold launch.
  A device whose process lives for days (a tablet nobody relaunches) needs a
  foreground-return check and a visible "Restart to update" affordance, or it
  will sit on an old bundle indefinitely. Take "ready" from
  `Updates.latestContext.isUpdatePending`, or from a fetch that returned a new
  update or a rollback: a fetch that returns neither means "nothing to
  launch", NOT "already have it".

## When the device has no app store: a second channel

A device without Play Services (an e-ink tablet, a kiosk, a handheld) cannot
receive native changes at all through the store, and `expo-updates` cannot
carry them. The app has to fetch its own build.

**Shape that worked.** A small manifest in a public bucket
(`{versionCode, versionName, bytes, sha256, url}`), read shortly after launch,
on foreground returns, and on demand from a settings row. When it names a
higher build than `expo-application` reports, the row offers it with its size,
downloads it under whatever keep-alive the app already uses for long
transfers, verifies size and hash, and hands the file to Android's installer.

**What the reader still does.** One tap in the system installer, every time,
plus a one-off "allow installs from this app" trip to settings. Android 11+
does not let an ordinary app install packages silently and there is no way
around it. Say so in the copy rather than letting the tap look like a bug.

**Security, which is not the hash.** The hash only proves the file is what the
MANIFEST named, and a manifest is only as trustworthy as the bucket. Android's
same-signing-key rule protects an update to the SAME package name, so a
rewritten manifest naming a different package would sail through a hash check
and show a branded install prompt for a stranger's app. Ask the platform what
the file actually is before offering it:

```kotlin
packageManager.getPackageArchiveInfo(path, GET_SIGNING_CERTIFICATES)
// compare packageName, the SHA-256 of the signing certificate, and versionCode
```

Pin your release certificate's digest in the app, refuse anything else, and
delete the file. A binary that cannot run the check offers nothing.

**Gate it on the surface, not the platform.** A Play-installed build must
never side-load over itself (Play forbids it, and the Play signing key may
differ). Ours is gated on the e-ink display mode, not on `Platform.OS`.

**Publishing mechanics that bit us.** Node's `fetch` dropped a 108 MB body
three times on a slow link and once exited the process with "unsettled
top-level await" and nothing in the bucket. Uploads go through curl with
`--http1.1` (HTTP/2 died mid-body on that link) and the resumable protocol the
storage backend speaks, in 6 MB pieces, so a bad link costs time rather than
the whole upload. Name the object by content (`app-<build>-<hash8>.apk`) so a
retry is idempotent and a rebuilt version can never overwrite bytes a live
manifest still points at. And use `curl --head`, never `-X HEAD`: the latter
waits for a body that never comes, which sat there for thirty minutes.
