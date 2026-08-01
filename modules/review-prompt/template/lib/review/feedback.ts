/**
 * The in-app feedback box's sink: a plain fetch POST to the `app-feedback`
 * Supabase edge function. Deliberately NOT the supabase-js client — the
 * accounts rule is that `@supabase/supabase-js` is imported only by
 * lib/accounts/client.ts, and feedback must work signed out anyway, so a
 * bare HTTP call with the public anon key is the whole integration.
 *
 * What travels: the message the reader typed, the app version, and the
 * platform. What NEVER travels: analytics get only `Feedback Sent {length}`,
 * and there is no email, no device id, no book titles.
 */
import {Platform} from 'react-native';
import {SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured} from '../accounts/config';
import {APP_VERSION} from '../version';

export const FEEDBACK_MAX_LENGTH = 2000;

/**
 * Send the reader's note. Resolves true on success. False means "keep the
 * text in the box and say so" — a failed send must never eat what they wrote.
 */
export async function sendFeedback(message: string): Promise<boolean> {
  const text = message.trim().slice(0, FEEDBACK_MAX_LENGTH);
  if (!text || !isConfigured) {
    return false;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/app-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        message: text,
        app_version: APP_VERSION,
        platform: Platform.OS,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
