# Running EasyShop tests

Run `npm test` from the project folder. In Windows PowerShell, use `npm.cmd test` if your execution policy blocks `npm.ps1`.

The command recursively discovers `*.test.js` suites and runs them with the current Node executable. It excludes dependency, backup and tool directories, accepts Node test options (`npm test -- --test-name-pattern=publication`), and returns a failing exit code if a test fails or no suites are found. Child server fixtures and the manual SMTP script are not standalone test suites.

Tests use temporary SQLite databases, synthetic accounts and mocked mail delivery. They do not reset the shop database or send verification email. The expected `Verification email failed: EAUTH` message exercises mocked delivery failure.

`npm run email:verify` is a separate, explicitly invoked SMTP connection check. It is never part of `npm test`.

Use a Node version with built-in `node:sqlite`; this workspace is verified with Node 24.

Run `npm run check` to validate source imports, page assets, and syntax after moving files. `npm run test:browser` exercises the message center in an isolated Chromium browser with mock mail delivery.
