# analytics (Amplitude)

Product-analytics blueprint. Vendors a thin, app-owned wrapper around
[Amplitude](https://amplitude.com) into an Expo / React Native app. Product
analytics only (events / funnels / retention) — no crash reporting.

## Why a wrapper

App code calls `track('book_opened', {...})`, never Amplitude directly. The
provider lives in one file (`client.ts`), so swapping or upgrading Amplitude is a
change here, not across the app. See [docs/analytics-research.md in DailyBook](../../../daily-book/docs/analytics-research.md)
for why Amplitude was chosen.

## Install into an app

Use the `setup-analytics` skill (see [SKILL.md](./SKILL.md)) — it does the whole
thing: copies the wrapper, installs the SDK, wires the root, prompts for the key.

Manual equivalent:

1. Copy `template/lib/analytics/` → `<app>/lib/analytics/`.
2. `npx expo install @amplitude/analytics-react-native` (peer dep
   `@react-native-async-storage/async-storage`; `cd ios && pod install`).
3. Wrap the root component in `<AnalyticsProvider>`.
4. Add `EXPO_PUBLIC_AMPLITUDE_KEY=...` to `.env`.

## Files

| File | Ownership | Purpose |
|---|---|---|
| `config.ts` | core | API key (from env) + shared privacy defaults |
| `client.ts` | core | The only file importing Amplitude; the swap point |
| `provider.tsx` | core | `<AnalyticsProvider>` + `useAnalytics()` + lifecycle events |
| `index.ts` | core | Public barrel export |
| `events.ts` | **app** | The app's event taxonomy. Edit this; re-sync won't touch it |

"core" files are overwritten on re-sync; the "app" file is never clobbered.

## Usage in app code

```ts
import {track, useAnalytics} from './lib/analytics';

track('book_opened', {book_id: id, source: 'gutenberg'});

// or inside a component
const {screen} = useAnalytics();
screen('Library');
```

Add your events to the `AnalyticsEvent` union in `events.ts` first — it's typed,
so unknown event names fail at compile time.

## Gotcha: async-storage version

Amplitude's RN SDK depends on `@react-native-async-storage/async-storage@^1.x`.
Modern Expo apps use 2.x. Without an override, npm installs a **second, nested**
copy of async-storage (a native module), which breaks the iOS/Android build with
duplicate-module errors. The blueprint pins it with an npm `overrides` entry
(`blueprint.json` → `install.npmOverrides`). Add it **before** installing
Amplitude; then `npm ls @react-native-async-storage/async-storage` should show a
single version marked `deduped`.

## Privacy defaults

IP capture off, screen views manual (volume control), sessions on. No PII or free
text in properties. Keys are public client keys (safe to ship).
