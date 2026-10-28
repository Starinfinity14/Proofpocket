# Manual smoke test checklist

- [ ] Open `index.html`; dashboard renders without a build step.
- [ ] Switch English ↔ Hindi; visible UI labels change.
- [ ] Add a purchase with item name and purchase date; dashboard counts update.
- [ ] Add a return-by date within 30 days; it appears in Coming up and Deadlines.
- [ ] Add a warranty date; active warranty count updates.
- [ ] Edit a record; fields are prefilled and changes persist.
- [ ] Search by item, seller, notes; clear search and verify all matching records return.
- [ ] Filter by category.
- [ ] Try a return or warranty date before purchase date; validation blocks save.
- [ ] Delete a record after confirmation.
- [ ] Export JSON and confirm it contains saved records.
- [ ] Delete all local data after confirmation; dashboard becomes empty.
- [ ] Refresh page; any remaining local records persist.
- [ ] Inspect at a narrow mobile viewport; navigation, forms and lists remain usable.
- [ ] Confirm no invoice upload, notification or cloud sync is implied by the UI.

These are planned manual checks, not claims that an automated test suite has run.
