# Session deployment configuration

Sessions use the existing SQLite database, with separate customer/admin namespaces.
Persist the database on a local durable volume with restricted filesystem access.
This suits the current single-host architecture. For multiple hosts, move to a shared
session service; do not place SQLite on a network filesystem.

## Environment

- `NODE_ENV=production` enables HTTPS-only cookies and rejects insecure requests.
- `BASE_URL=https://your-shop.example` is required in production and must be the exact
  browser-facing origin. Update Google's authorized callback to
  `https://your-shop.example/auth/google/callback`.
- `SESSION_SECRET` must be a cryptographically random secret of at least 32 bytes.
  Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  and store it in your hosting secret manager. Never commit or log it.
  Missing/weak secrets prevent production startup. Development uses a random
  temporary secret when configuration is missing/weak; a configured strong secret
  preserves sessions across restarts. Changing the secret invalidates existing cookies.
- `TRUST_PROXY` defaults to no trusted proxies. If HTTPS terminates at a reverse proxy,
  set only its IP addresses or narrow CIDRs, separated by commas. Do not use `true`,
  numeric hop counts, or broad ranges. The proxy must overwrite forwarded headers;
  firewall the Node port against direct public access.

Production cookies are host-only, HttpOnly, Secure, SameSite=Lax, Path=/.
Lax allows Google's top-level OAuth callback; OAuth state is verified separately.
Local HTTP development remains supported. Customers expire after 30 minutes idle
or 8 hours absolute; admins after 15 minutes idle or 4 hours absolute. Background
identity/profile/unread polling does not extend idle time. Expired database records
are rejected on every load and cleaned lazily. Restarting with the same secret and
database preserves unexpired sessions. The former in-memory sessions require login again.

All unsafe requests require `X-CSRF-Protection: 1`, reject mismatching Origin and
cross-origin Fetch Metadata. The shared browser fetch wrapper adds the header only
to same-origin requests. This deliberately requires JavaScript forms; do not enable
credentialed cross-origin CORS or remove this header check. External API clients must
send the header too. Google GET callbacks are preserved and protected by OAuth state.

Login replaces the previous session ID and saves before responding. Logout deletes
the server record and clears only the corresponding cookie. Sessions contain account
identity, expiry metadata, and short-lived Google/greeting/guest state; passwords,
OAuth access tokens, and payment credentials are not stored in sessions.

Run automated checks with `npm.cmd test`. Verify HTTPS, proxy header handling, and
the live Google round trip on the actual host before deployment.
