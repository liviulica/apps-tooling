/**
 * Supabase client wrapper (CORE FILE — overwritten on blueprint re-sync).
 *
 * This is the ONLY file that imports @supabase/supabase-js. App code never
 * touches Supabase directly: it goes through the provider/hooks or the sync
 * engine. To swap backends, this is the single file you rewrite.
 *
 * Everything is safe when the module is unconfigured (missing env): getters
 * return null and callers degrade to signed-out, so accounts never break the
 * app.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {SUPABASE_ANON_KEY, SUPABASE_URL, isConfigured} from './config';
import type {RemoteState, SyncTransport} from './types';

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isConfigured) {
    if (__DEV__) {
      console.warn(
        '[accounts] EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY not set — accounts are disabled.',
      );
    }
    return null;
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** SyncTransport backed by the user_state table (RLS scopes rows to the user). */
export function makeTransport(): SyncTransport | null {
  const supabase = getSupabase();
  if (!supabase) {
    return null;
  }
  return {
    async pullAll(userId) {
      const {data, error} = await supabase
        .from('user_state')
        .select('namespace, data, updated_at')
        .eq('user_id', userId);
      if (error) {
        throw new Error(error.message);
      }
      const result: Record<string, RemoteState> = {};
      for (const row of data ?? []) {
        result[row.namespace as string] = {
          data: row.data,
          updatedAt: row.updated_at as string,
        };
      }
      return result;
    },
    async push(userId, namespace, data) {
      const {error} = await supabase.from('user_state').upsert({
        user_id: userId,
        namespace,
        data,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        throw new Error(error.message);
      }
    },
  };
}

/** Calls a Supabase edge function with the signed-in user's JWT attached. */
export async function invokeFunction<T>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('[accounts] not configured');
  }
  const {data, error} = await supabase.functions.invoke(name, {body});
  if (error) {
    throw new Error(error.message);
  }
  return data as T;
}
