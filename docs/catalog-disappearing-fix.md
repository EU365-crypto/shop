# Category and product persistence fix

## Verified causes

The earlier running Node process returned only `rows` from `/api/catalog`, despite the newer frontend sending categories and a revision. SQLite contained 18 published products but four product category IDs had no matching saved category. The products were not deleted: category rendering hid them when the saved category list replaced the browser-only list. The corrected server and legacy category recovery resolved that mismatch.

The follow-up inspection found independent category fetches and focus/storage handlers that replaced product state from browser caches. Those paths could mix categories from one snapshot with products from another. The cart + handler itself does not write or delete catalog data; its actual event handler is now covered by a regression test.

The database path was relative to the terminal working directory. Starting Node from another directory could open a different `shop.db` and appear to lose all data.

## Changes

- `server.js`: opens the existing project `shop.db` using `__dirname`.
- `public/assets/js/store/storefront.js`: loads categories and products together from `/api/catalog`, holds their complete snapshot in memory, rejects incomplete responses and ignores stale in-flight responses. Browser caches are optional; unavailable or corrupt storage cannot stop storefront loading. Cart reads/writes remain separate from catalog state.
- `public/assets/js/store/categories.js`: customer storefront/category refreshes use the combined API; they no longer replace catalog products from localStorage or run a competing category-only fetch. Displayed categories use the loaded published snapshot.
- `public/assets/js/admin/admin-store-editor.js`: marks editor initialization so public refreshes cannot overwrite data while the editor starts.
- `public/assets/js/admin/catalog-editor.js`: requires complete saved draft responses and treats browser cache write failures separately from successful database publication.

Existing `src/catalog/catalog-workflow.js` persists products and categories in one SQLite transaction, maintains private draft/public snapshots, enforces admin authorization and revision conflicts, validates product/category IDs, and reports success after COMMIT. Incomplete legacy writes are rejected. Publication intentionally replaces the whole approved working catalog, including explicitly removed items; it never merges stale browser data.

No users, orders, admin settings or database files are reset or deleted. Existing authentication and CSRF protection remain in place. The subsequent cleanup removed unreachable legacy editor helpers and replaced standalone admin settings scripts with the existing unified form. The old category write endpoint continues rejecting immediate writes to prevent outdated clients from modifying published data.

## Verification

`tests/catalog-persistence.test.js` starts the real catalog, authentication and session modules in a child Node process using a temporary SQLite file. It covers create/save/publish, admin reload, customer visibility and authorization, logout/login, category rename and price changes, private drafts, rejection of incomplete publication and an actual process restart.

`tests/store-publication.test.js` runs the real frontend functions in a simulated DOM: the actual product + click handler updates only cart quantity/storage, preserves the product card and catalog snapshot, and works with newly published products. It also tests stale responses, corrupt/unavailable browser storage and the removal of cache-based category refreshes.

Tests never publish synthetic products into the real shop database. These are automated API and simulated DOM tests, not a manual browser session. The live database/API checks also compare published counts and category relationships without changing shop data.
