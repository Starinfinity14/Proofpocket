# ProofPocket — household purchase organizer prototype

A responsive, bilingual (English/Hindi) browser prototype for tracking household purchases, return-by dates and warranty end dates.

## Run it

No package installation, API key, paid AI builder, backend or build step is required.

1. Extract this folder.
2. Open `index.html` in a modern browser, or serve this folder with any static HTTP server.
3. Add sample purchases and test the Overview, My records, Deadlines, and Settings & privacy views.

## Features implemented

- Responsive desktop/mobile layout.
- English and Hindi UI labels.
- Create, edit and delete purchase records.
- Item, seller, category, purchase date, amount, return date, warranty end date and notes.
- Search by item, store, category and notes; category filter.
- Upcoming and past deadline views.
- Dashboard counts for purchases, active warranties and deadlines within 30 days.
- Local browser storage, JSON export and local data deletion.
- Basic input validation and output escaping.

## Important limitations

This is a **prototype, not a production document vault**. Data is stored in the current browser's local storage. It does not upload invoice files, provide accounts, sync across devices, send automatic notifications, connect to retailers, or use a cloud database. Do not use it to store sensitive information or as the only copy of important records. Clearing browser data can remove records. The amount field currently formats values as INR; international currencies are not yet configurable. The browser language setting is remembered locally.

## Next engineering stage

1. Add a test suite and CI workflow.
2. Add a backend only after validating the workflow, using authentication, row-level security and private object storage.
3. Implement signed download URLs, file size/type checks, ownership tests, export/delete workflows and security review before handling real documents.
4. Add locale-aware currency selection and properly reviewed translations.
5. Validate demand with interviews/usability sessions and a simple landing-page test before adding subscriptions or AI.

## Files

- `index.html` — accessible page structure and modal form
- `styles.css` — responsive UI
- `app.js` — browser-only state and interactions
