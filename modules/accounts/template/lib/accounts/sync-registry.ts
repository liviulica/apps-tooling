/**
 * Sync registry (APP-OWNED FILE — NOT overwritten on blueprint re-sync).
 *
 * The ONLY accounts file you edit per app. Declare each piece of local state
 * that should follow the user across devices: how to load/save it locally and
 * how to merge a local and a remote copy.
 *
 * Merge rules of thumb:
 *   - counters / totals: take the max
 *   - "furthest progress": take the max per item
 *   - preferences: last-write-wins (prefer whichever side you trust; add a
 *     timestamp inside the payload if you need real LWW)
 *   - collections (wishlist): union by id
 * merge() is called with null for a missing side and must be pure.
 *
 * Example (AsyncStorage-backed namespace):
 *
 *   import AsyncStorage from '@react-native-async-storage/async-storage';
 *
 *   const settings: NamespaceAdapter<{fontSize: number}> = {
 *     load: async () => {
 *       const raw = await AsyncStorage.getItem('@myapp_settings');
 *       return raw ? JSON.parse(raw) : null;
 *     },
 *     save: async data => {
 *       await AsyncStorage.setItem('@myapp_settings', JSON.stringify(data));
 *     },
 *     merge: (local, remote) => remote ?? local,
 *   };
 *
 *   export const syncRegistry: SyncRegistry = {settings};
 */
import type {SyncRegistry} from './types';

export const syncRegistry: SyncRegistry = {
  // --- register your app's synced namespaces here ---
};
