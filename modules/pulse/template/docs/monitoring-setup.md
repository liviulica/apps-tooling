# Monitoring setup: the credentials `/pulse` needs

Everything in the codebase is done. These are the console steps, and every one
of them is optional: a source without its credential reports `unavailable`
with the variable's name, and the other sources still run. Set up whichever
you want, in any order.

## Where the values go

One file at the repo root: **`.env.monitoring.local`**.

```
ASC_KEY_ID=
ASC_ISSUER_ID=
ASC_P8_PATH=
ASC_VENDOR_NUMBER=
AMPLITUDE_API_KEY=
AMPLITUDE_SECRET_KEY=
REVENUECAT_SECRET_KEY=
REVENUECAT_PROJECT_ID=
SUPABASE_ACCESS_TOKEN=
```

**Never put these in `.env`.** In an Expo/EAS app the client `.env` is
uploaded to the build servers so the app's public keys reach the bundle, and a
secret in there ships to the build infrastructure. `.env.monitoring.local`
matches the usual `.env.*.local` ignore rule, which both git and `.easignore`
already exclude. Confirm with `git check-ignore -v .env.monitoring.local`.

Nothing here is ever read by the app. These are dashboard credentials for a
script that runs on your machine.

---

## 1. Crashlytics (no variables, one login)

Crashes come through the Firebase MCP server registered in `.mcp.json`, which
uses the Firebase CLI's own login.

```bash
npx firebase-tools@latest login
```

Sign in with the account that owns the Firebase project. Restart Claude Code
so it picks up the MCP server, then `/mcp` should list `firebase`.

There is no REST read API for Crashlytics, so this is the supported path. The
alternative is the BigQuery export, which needs the Blaze plan.

## 2. App Store Connect (`ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_P8_PATH`)

Gets you reviews, the store version state, and TestFlight builds.

1. App Store Connect > Users and Access > Integrations > App Store Connect API.
2. Under Team Keys, note the **Issuer ID** at the top of the page. That is
   `ASC_ISSUER_ID`. It is one UUID for the whole team and it cannot be derived
   from the key file.
3. Generate a key. **The role decides how much you get, and reviews and sales
   need different ones:**
   - **Developer** or **App Manager** is enough for reviews, builds and the
     store version state.
   - Sales reports (section 3) additionally need **Finance**, **Sales** or
     **Admin**. A Developer-role key reads reviews perfectly and is refused
     every report with "The API key in use does not allow this request",
     which reads like a bad vendor number and is not.
   - One **Admin** key covers both. If you would rather not hand a script an
     Admin key, keep a Developer key here and leave sales unavailable.

   Its **Key ID** is `ASC_KEY_ID`.
4. Download the `.p8`. **Apple lets you download it once.** Put it outside the
   repo, for example `~/.appstoreconnect/private_keys/AuthKey_XXXXXXXX.p8`
   with `chmod 600`, and set `ASC_P8_PATH` to that absolute path.

If you already made a key for `eas submit`, reuse it: same three values.

Star ratings do not come from here. The App Store Connect API only returns
reviews that carry text, and it has no endpoint for the star average at all,
so the pulse reads those from the public `itunes.apple.com/lookup` endpoint,
which needs no credential and works before any setup.

## 3. Sales figures (`ASC_VENDOR_NUMBER`, optional)

App Store Connect > Payments and Financial Reports, or Sales and Trends: the
vendor number is the 8-to-10 digit number beside your legal entity name.
Requires the Account Holder, Admin or Finance role to view.

The vendor number is only half of it: the key from section 2 must also carry
Finance, Sales or Admin access, or every day of the report answers 403. The
pulse says which of the two is wrong.

What this buys you is the **units** figure, which is the download count. It
exists nowhere else in the pulse: analytics sees who launched the app, the
billing provider sees who paid, and neither counts installs.

## 4. Amplitude (`AMPLITUDE_API_KEY`, `AMPLITUDE_SECRET_KEY`)

Amplitude > Settings > Projects > (your project) > General.

- **API Key** is the same public key the app ships. Copy it here too.
- **Secret Key** is on the same page and is a real secret.

**Take both from the SAME project.** A mismatched pair answers 403 "Invalid
API/Secret Key combination", which is easy to read as a broken integration.

If your project's data region is EU, the default host is already correct. Set
`AMPLITUDE_SERVER_ZONE=US` for a US project. This matters more than it looks:
the wrong host answers with an empty result rather than an error, so every
funnel would read zero with nothing to notice.

## 5. RevenueCat (`REVENUECAT_SECRET_KEY`, `REVENUECAT_PROJECT_ID`)

RevenueCat dashboard > Project settings > API keys.

1. Create a **secret** key (v2 uses Bearer auth; the public SDK keys the app
   ships cannot read metrics).
2. Give it the **`charts_metrics:overview:read`** permission. Without it every
   call answers 403, and the pulse will tell you exactly that.
3. The **Project ID** is in that page's URL.

## 6. Supabase (no variables for the main blocks)

Accounts, sync rows and in-app feedback come from the service key, which the
script fetches from the logged-in CLI on demand and never stores:

```bash
supabase login
supabase link --project-ref <your project ref>
```

`SUPABASE_ACCESS_TOKEN` is optional and only unlocks edge function error logs,
which live behind the Management API rather than the service key.

---

## Checking it worked

```bash
node scripts/monitoring/pulse.js --since 7d
```

Every source you configured should report numbers; every source you did not
should say `unavailable` and name its variable. That is the design: a source
that could not answer never renders as a zero.
