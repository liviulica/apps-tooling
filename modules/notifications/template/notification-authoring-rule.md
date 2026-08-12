## Notifications (required when adding or changing one)

Full rules: `apps-tooling/modules/notifications/notification-guidelines.md`.

- **Never raise the system prompt cold.** Our own screen asks first; the system
  prompt is raised ONLY for a reader who already said yes. iOS grants exactly one
  prompt per install, so a cold decline is permanent — a decline in our screen
  costs nothing.
- **Never re-ask a decliner.** Track "asked" separately from "enabled": someone
  who declined has been asked and is not enabled. Conflating them nags every
  launch.
- **Timing is behaviour, not preference.** Schedule from the reader's last
  session (+23.5h), with a fixed local hour as the fallback for no history or a
  window that has already passed. Never 24h exactly (it drifts later every day),
  and never fire something seconds away.
- **Cancel the moment the thing is done.** A reminder about a goal already met is
  the fastest way to get the app muted. Reaching the goal must CANCEL, not
  send-and-ignore.
- **Never claim a streak that does not exist.** No reminder on day zero; the
  first notification a reader gets defines what they think the channel is for.
- **One identifier, always replace.** Cancel unconditionally before scheduling,
  so reminders can never accumulate into three in one evening.
- **Check OS permission at schedule time**, not the stored flag. The reader can
  revoke in Settings and the app is never told.
- **Services default ON, messages default OFF.** A streak reminder is a service
  they opted into; weekly stats are a message they did not. One permission must
  not smuggle the second in behind the first.
- **Local before remote.** If the fact lives on the device, schedule locally: no
  APNs key, no Firebase, no token table, and it works signed out.
- **Two analytics events**, ours and the OS's, because they diverge and the gap
  is the only measure of whether the priming screen works. No content in
  properties.
- **The decision is a pure function returning a plan**; only one module touches
  the scheduler. Test every "scheduled nothing" reason, and test that declining
  does NOT call the native request — a broken version is invisible otherwise.
  Guard the double tap with a ref, never state.
