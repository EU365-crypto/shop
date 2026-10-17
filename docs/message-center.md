# EasyShop message center

## Changed files

- `src/mail/message-center.js`: authenticated API, additive migration, drafts, participant state,
  persistent outbox and verification resend.
- `server.js`: registers the new service with existing Gmail and verification helpers.
- `src/auth/session-security.js`: excludes background message polling from session activity.
- `src/mail/contact.js`: enforces verified account sender identity on signed-in contact forms;
  retires the previous immediate-send admin reply endpoint.
- `private/account/account-emails.html`, `private/admin/admin-emails.html`: host the shared message UI.
- `public/assets/js/mail/message-center.js`, `public/assets/css/message-center.css`: responsive interface, draft
  recovery, safe rendering, interaction and live polling.
- `public/assets/js/mail/email-badges.js`: counts unread conversations from the new service.
- `tests/message-center.test.js`, `tests/session-security.test.js`: backend/security regression checks.
- `scripts/verify-message-center.cjs`: isolated real-browser interaction checks.
- Removed `public/account-inbox.js` and `public/admin-inbox.js` after confirming their
  only page references were replaced by the shared UI.

The final `npm test` run passed 82 tests. The headless browser checks also passed.

Customer messages: `/account/emails`. Admin support inbox: `/admin/emails`.
Customers compose new conversations or reply; admins select a customer conversation to reply.
Both interfaces support search, paginated Inbox/Sent/Trash, read filters, unread counts,
chronological history, saved drafts, and independent read/trash/delete state. Admins also
have an Unanswered filter. At widths up to 700px the list and conversation become separate
views with Back controls. User content is rendered with textContent, never HTML.

## Storage and migration

On server startup `src/mail/message-center.js` adds SQLite tables `mc_conversations`, `mc_messages`,
`mc_participants`, `mc_drafts`, `mc_outbox`, and `mc_limits`, plus pagination/queue indexes.
Existing contact messages and replies are imported idempotently; original tables and all
users, catalog, orders and settings are retained. Participant `hidden_through` preserves
permanent deletion of old history if a later message reopens the conversation.
Deletion removes only the acting participant's view; another participant's history remains.

Messages and queue entries are committed together before returning HTTP 202. Stable,
account-scoped request keys deduplicate repeated HTTP submissions. Drafts are saved in
SQLite with account-scoped local browser recovery for a refresh before autosave completes.
They remain stored on provider failure and are removed only after provider acceptance.
Editing a previously submitted draft creates a fresh request key. Retrying a failed delivery
reuses the original message and outbox entry. No emails are sent automatically after verification.

## Configuration and delivery

Use the existing server-only `GMAIL_USER`, `GMAIL_PASS`, `CONTACT_EMAIL`, and `BASE_URL`.
GMAIL_USER must be the configured, authorized Gmail sending account; GMAIL_PASS is its app
password. The worker verifies SMTP authentication before sending (cached for ten minutes).
BASE_URL must point to the deployed site so verification and reply links work. Production
also retains existing HTTPS, SESSION_SECRET and explicit proxy requirements.

Restart Node after updating: stop the running server with Ctrl+C, then `npm start`.
The persistent worker claims one queued message every two seconds. Restarting does not
drop queued messages. A sending claim interrupted for over two minutes becomes uncertain
and is not automatically retried. Explicit retries have a ten-second cooldown and a five-attempt
limit. Normal message sending is limited to ten messages per account per ten minutes;
verification resend is limited to once per minute. Limits are persisted in SQLite.

Gmail SMTP acceptance is displayed simply as Sent; this does not confirm delivery. SMTP does
not provide inbound reply synchronization or authenticated delivery/bounce webhooks here.
Notification emails contain only the message body. Customer-facing histories show the
store name and hide admin account email addresses; authorized admins retain author identity.
`MESSAGE_FROM` optionally sets a provider-authorized store/no-reply sending address; otherwise
the configured store Gmail mailbox is used. A made-up From address cannot hide an underlying
mailbox: use a dedicated store sending account or a provider-authorized domain configuration.
Admin notifications fail safely if the configured sending/authentication mailbox matches
an administrator's account email, preventing that address from appearing in email headers.
External mail-app replies are not imported. A network failure after sending can leave acceptance uncertain: users
must acknowledge possible duplicate email delivery before retrying. Stable Message-ID
helps association but SMTP cannot guarantee exactly-once external delivery.

The old admin reply endpoint returns 410 and directs clients to the new center, preventing
the retired immediate-send path from bypassing the outbox. Existing guest contact forms
now require a six-digit email verification code before sending Order or Item Request,
Email Us, or Partnership. Codes are hashed in `contact_email_codes`, bound to a random
browser-session owner and email, expire in ten minutes, allow five attempts, and have
a one-minute resend cooldown plus an IP limit. Successful guest sending consumes the
verification; failed sending retains it for retry. Changing the address requires new
verification. Signed-in customers use their already verified account email, without an
additional code. `public/pages/mail/contact.html`, `public/assets/js/mail/contact.js`, `public/assets/js/shared/language.js` and
`tests/contact-verification.test.js` provide the controls, translations and coverage.

Order or Item Request replaces the free-text message with an optional JPG/PNG/WebP/HEIC/HEIF/AVIF
photo (up to 10 MB), followed by a required product name. The image is validated on the server,
attached to the store email and saved in the additive `contact_images` SQLite table alongside
the request. Message-center image routes require conversation ownership or administrator
access and respect participant deletion. Email Us and Partnership still use their message
textarea. Failed sends retain the chosen file and product name in the current form.
`src/media/request-photo.js` runs decoding in a worker (`src/media/request-photo-worker.js`) to keep the server
responsive. Actual file signatures and decoded content are checked, with a 60-megapixel
limit, two concurrent workers, a 30-second deadline and an 18 MB output limit. HEIC/HEIF
and AVIF are converted to JPEG for browser/email compatibility; pixel dimensions are
preserved. JPEG orientation is applied and embedded metadata is removed. The uploaded
file's original encoded bytes/metadata are not retained; the full-resolution viewable image
is stored. Sharp and heic-decode are the decoder dependencies.

Both private message pages load `public/assets/js/mail/message-image-viewer.js`. Clicking an image opens
a modal at its natural pixel size, with scrolling, Fit to Screen/Original Size, Close and
Escape. Focus stays inside the modal; closing restores page scrolling and the trigger's
focus. Desktop and mobile browser checks exercise the same viewer for admin and customer.

## Live updates and security

Visible message pages poll every five seconds; store email badges poll every fifteen seconds.
Focus/visibility restoration fetches missed updates. Polls preserve active reply input and
unchanged list DOM; hidden pages suspend work and page exit clears timers. Background GETs
do not extend authenticated session idle deadlines. Existing isolated admin/customer sessions
and CSRF protection cover all new routes. Ownership, verification and sender identity are
rechecked against SQLite. Message bodies, passwords and provider secrets are never logged.

Run `npm test` for automated suites, including message ownership, draft recovery, provider
failures, idempotency, retry safety, participant isolation, verification limits, CSRF,
and SQLite reopen persistence. No real emails are sent by those tests.

`node scripts/verify-message-center.cjs` runs an isolated headless Chromium check with mock
mail and an in-memory database. It checks refresh recovery, blocked unverified sends,
duplicate submissions, safe message rendering, live replies without clearing draft input,
provider status updates, failed delivery/retry, mobile/tablet/desktop layout and keyboard
Back. Set EASYSHOP_TEST_BROWSER if Chrome/Edge is installed elsewhere. Browser profiles
are retained in the temporary directory. It never opens the production database or sends mail.
