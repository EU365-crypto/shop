# Code audit and organization

Application source, browser pages and assets, tests, and maintenance scripts were reviewed and checked. Generated dependencies, private environment settings, user data, and backups were excluded from cleanup.

Changes:
- Organized 82 files by feature while preserving public page URLs and the root server launch command.
- Shared contact/message-center image-preview handling and extracted duplicate image-viewer styles.
- Removed unused message-center UI state and obsolete styles.
- Replaced repeated catalog category/subcategory searches with indexed validation.
- Avoided hashing the configured admin password on startup when the account already exists.
- Fixed Escape closing the email underneath an image preview.
- Updated imports, workers, assets, fixtures, and verification scripts for the new layout.
- Made security page coverage recursive and added an HTTP check for legacy page URLs and assets.

Validation: automated tests, source syntax/import/asset checks, and isolated desktop/tablet/mobile message-center browser checks. These checks reduce regression risk; they do not guarantee the absence of every possible defect.
