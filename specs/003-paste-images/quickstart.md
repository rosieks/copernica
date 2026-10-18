# Quickstart & Validation: Paste and Drop Images

Scenarios proving the feature end to end. API: [contracts/api.md](contracts/api.md).
Settings: [contracts/configuration.md](contracts/configuration.md). UI:
[contracts/ui.md](contracts/ui.md). Entities: [data-model.md](data-model.md).

## Setup

Use the local setup from
[001 quickstart, section A](../001-git-backed-team-wiki/quickstart.md#a-local-evaluation-no-external-services)
and configure the three spaces as follows:

```bash
# handbook: default location (.attachments)
--Copernica:Spaces:1:Attachments:Path=images            # service (Folder=docs)
--Copernica:Spaces:2:Id=notes --Copernica:Spaces:2:Provider=Git \
--Copernica:Spaces:2:Attachments:Path={page}.assets      # a third, local-only space
```

You also need test images (`screenshot.png`, `photo.jpg`, `anim.gif`, `diagram.svg`), a
renamed executable `fake.png`, and an 11 MB `big.png`.

## Scenarios

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| P1 | Edit `handbook/guides/setup.md`; copy a screenshot to the clipboard and paste | Placeholder, then the "Describe the image" dialog; after *Insert*, `![…](../.attachments/image-xxxxxxxx.png)` at the cursor; preview shows the image | US1-1, US2-2/3, FR-002, FR-015 |
| P2 | Drop `photo.jpg` and `anim.gif` onto the editor | Two references at the drop point, in order; both previews show; the GIF animates | US1-2 |
| P3 | Save with "Add screenshots" | `git log -1 --stat` on the remote: **one** commit by alice, message "Add screenshots", containing `guides/setup.md` and the image files under `.attachments/` | US1-3, FR-007, SC-003 |
| P4 | Paste an image, delete its reference, save | The commit does not contain that image; `pending/` no longer holds it | US1-4, FR-007 |
| P5 | Paste an image, then *Cancel* → *Discard* | No commit; the pending row stays until it expires. With the clock moved forward 25 h (test hook) or after 25 h, the row and the file are gone | US1-5, FR-008, SC-004 |
| P6 | Drop `fake.png`, `big.png` and a `.txt` file | Nothing inserted; three Callouts naming format / size (10 MB) / format; `pending/` unchanged | US1-6, FR-003 |
| P7 | Throttle the network, paste a 5 MB image and keep typing | Typing works; progress row and live region; text typed during the upload is kept | US1-7, FR-004 |
| P8 | alice and bob paste `image.png` at the same time on two pages and save | Two different files; each page shows its own image | US1-8, FR-012 |
| P9 | Keyboard only: Tab to *Insert image* → pick `diagram.svg` → type a description → Enter → save | Reference with the description; focus back in the editor; the rendered page has `<img alt="…">`; SVG served with `CSP: sandbox` | US2, FR-005, FR-017 |
| P10 | In the dialog, check "Decorative image" | `![](…)` inserted | US2-4 |
| P11 | Paste in `service/api.md` (Folder=docs, `images`) and in `notes/guides/setup.md` (`{page}.assets`) | Files in `docs/images/` and `guides/setup.assets/` of their repositories; links `images/...` and `setup.assets/...`; both display in VS Code's Markdown preview and in the git platform's file view | US3, FR-013, FR-015, SC-005 |
| P12 | Start with `Spaces:2:Attachments:Path=../outside` | `notes` shows a configuration error; `handbook` and `service` work | US3-6, FR-014 |
| P13 | Push, with plain git, a page with `![x](/.attachments/x.png)` plus the file, to `service` (Folder=docs) | Image shown, resolved from `docs/`; `![y](/../secret.png)` renders as a broken image | US4, FR-016, SC-007 |
| P14 | Paste an image, reload the editor tab; then sign out and in again | Draft and image restored; preview shows it; saving commits it | FR-009 |
| P15 | alice pastes an image; bob tries to open alice's `/api/uploads/{id}` | 404 | FR-010 |
| P16 | Repeat 001 A9/A10 with an image pasted by bob before saving | Merge: one commit including bob's image. Conflict → resolve → saved resolution includes the image | Edge cases, R3 |
| P17 | Run the 002 WCAG scan with the toolbar, progress row, error Callout and dialog visible | 0 violations, both themes | SC-006 |

## Automated checks

```bash
dotnet test                              # format detection, templates, upload/save/render/cleanup integration
npm --prefix src/web test                # paste/drop routing, placeholders, alt-text suggestion
npx --prefix tests/e2e playwright test --project=chromium   # P1–P17 automated parts (P11 viewer check and P5's 25 h are manual or test-hooked)
pwsh scripts/check-licenses.ps1          # no new dependencies expected
```
