# Catalog drafts and publication

Admin category creation, renaming, ordering and removal update the same local working state as product edits. They do not send requests or change the storefront. The sticky toolbar shows Unsaved Changes for either kind of edit.

Save Draft persists products and categories together, privately. Publish All validates and replaces the complete public catalog and category list in one SQLite transaction. Discard Changes restores the most recently loaded or successfully saved state. Failed saves and revision conflicts retain local work and the unsaved indicator. Existing navigation and refresh warnings protect both products and categories.

Removing a category requires confirmation. The category and its products leave the working catalog and move into private admin History, accessible beside Add Category. Save Draft persists history; Publish All removes the archived items from the public catalog. Restore returns the category and products to the working draft. Discard reverses unsaved removals or restores. History survives server restarts and is never included in the customer API.

Both write endpoints accept `{ rows, categories, revision }`. Admin authorization and existing CSRF protection remain required. The old immediate category write endpoint rejects writes with 409. SQLite schema migration preserves existing data and adds draft categories and a revision counter; it does not undo previously published changes.

Concurrent saves with an outdated revision return 409 without overwriting the newer state. Export Draft downloads your local work; Reload Saved Draft asks before discarding unsaved edits. Reconcile the exported edits with the newer draft manually. There is no automatic merge or local recovery after closing the tab.

Implementation: `src/catalog/catalog-workflow.js` supplies validation, migration and atomic backend writes through `src/catalog/catalog.js`. `public/assets/js/admin/catalog-editor.js` owns combined state and saved snapshots. `public/assets/js/admin/admin-store-editor.js` supplies category controls, discard and conflict recovery. Category/menu/store scripts keep admin drafts separate from public caches. `public/assets/js/shared/unsaved-changes.js` restores saved state when navigation discard is confirmed.
