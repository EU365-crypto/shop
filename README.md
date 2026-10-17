# HongKong Supermarket

Storefront, catalog administration, customer accounts, and support messaging.

Use Node 24 or a compatible version with built-in `node:sqlite`. Install dependencies with `npm install`, configure the existing environment settings, and run `npm start`. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

- `npm test`: isolated automated tests with mock mail delivery.
- `npm run check`: JavaScript syntax, imports, inline scripts, and page asset checks.
- `npm run test:browser`: isolated Chromium email-interface checks; requires Chrome or Edge (or `EASYSHOP_TEST_BROWSER`).
- `npm run email:verify`: explicitly checks the configured SMTP connection.

## Source layout

| Folder | Purpose |
| --- | --- |
| `src/auth` | Authentication, verification, and session security |
| `src/accounts`, `src/admin` | Profiles and administration settings |
| `src/catalog` | Catalog storage, editing, and publication |
| `src/mail` | Contact forms, message center, and mail transport |
| `src/media` | Image processing and worker |
| `src/web` | Public page URL registry |
| `public/assets` | Browser JavaScript grouped by feature, styles, and images |
| `public/pages` | Public HTML grouped by feature |
| `private/admin`, `private/account` | Authenticated HTML pages |
| `tests` | Tests, fixtures, and server helpers |
| `scripts` | Verification and test runner utilities |
| `docs` | Setup, behavior, and maintenance documentation |

`server.js` remains the stable launch entry point; `src/server.js` wires the application. Existing page URLs remain supported. Environment files, database contents, dependencies, and backups are not source cleanup targets.
