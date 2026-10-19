# Quickstart & Validation: Managing the Page Tree

Scenarios proving the feature end to end.
- API: [contracts/api.md](contracts/api.md)
- `.order` format: [contracts/order-file.md](contracts/order-file.md)
- UI: [contracts/ui.md](contracts/ui.md)
- Entities: [data-model.md](data-model.md)

## Setup

Use the local setup from
[001 quickstart, section A](../001-git-backed-team-wiki/quickstart.md#a-local-evaluation-no-external-services)
with alice (write access) and carol (read-only). Seed the `handbook` space with:

```text
index.md            # links: [Setup](guides/setup.md), [API](/reference/api.md), wiki:handbook/guides/faq.md
guides/setup.md     # "# Setup", links ../reference/api.md and ![](../.attachments/s.png); has 2 open discussions
guides/faq.md       # links setup.md#install, and `setup.md` inside a code span
guides/tiny.md      # one line: "[s](setup.md)"
reference/api.md
reference/.order    # "api" (Azure DevOps style)
archive/2019/*.md   # 40 pages + 2 images
.attachments/s.png
```

A second space `service` links to `wiki:handbook/guides/setup.md`.

## Scenarios

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| T1 | As alice, open the "⋯" menu of `guides/setup.md` in the tree → Rename. Change the title to "Installing", keep the derived file name `Installing.md`, confirm | Effects line "2 other pages link here…". `git log -1 --stat`: **one** commit by alice with `guides/{setup.md → Installing.md}`, `index.md`, `guides/faq.md`, and a trailer `Copernica-Moved: guides/setup.md -> guides/Installing.md`. The tree label reads "Installing"; the URL is replaced | US1-1, US1-7, FR-005, FR-011, R13 |
| T2 | Inspect the T1 commit's diffs | `index.md`: only the URL changed. `faq.md`: `Installing.md#install` changed, the code span is unchanged. Heading text replaced in the moved page | FR-011, R7 |
| T3 | Open the renamed page | Both discussions are listed and anchored; History shows the commits from before the rename | US1-3, FR-006, SC-003 |
| T4 | Open the bookmarked `/s/handbook/guides/setup.md` | URL becomes `…/guides/Installing.md`; callout "This page was moved from “guides/setup.md”" | US1-4, FR-010, SC-004 |
| T5 | Move `guides/Installing.md` to `reference/` with the Move dialog | Moved; its links `../reference/api.md` → `api.md` and image `../.attachments/s.png` still resolve; `reference/.order` gains `Installing` at the end; `/s/handbook/guides/setup.md` still leads to the current page (2 hops) | US1-2, US1-8, FR-012, FR-021, edge case "chain of moves" |
| T6 | Move `guides/tiny.md` to `archive/` (its only link must change) | History of `archive/tiny.md` shows its creation commit (stitched via trailer even though `git log --follow` may not) | R3, R5 |
| T7 | Rename to an existing name; rename to `a/b`, `..`, `con:x`, `.order` | `target-exists` / validation errors inline; no commit | US1-5, FR-007, R15 |
| T8 | alice opens the Move dialog for `guides/faq.md`; meanwhile bob edits `faq.md` and `index.md` via git and pushes; alice confirms | Move succeeds; bob's edits are present at the new location and in `index.md` | US1-6, FR-008, SC-007 |
| T9 | Same as T8, but bob *deletes* `faq.md` | `tree-changed` callout; tree reloads; no commit | FR-008, R2 |
| T10 | alice edits `guides/faq.md` in tab A; in tab B moves it to `reference/`; saves tab A | Saved; the toast says the page had been moved; URL is `reference/faq.md`; the commit holds alice's text at the new path; nothing at the old path | Edge cases "edit while moved", "unsaved draft", R6 |
| T11 | Rename `Setup.md` → `setup.md` (case only) on a Windows host | One commit with the case change; tree and URL updated | Edge case "case-only" |
| T12 | Root "⋯" → New folder "how-to", first page "index" → save | Editor at `how-to/index.md`; after save, folder and page in the tree. Repeat and Cancel: no folder appears | US2-2, US2-3, FR-014 |
| T13 | Folder `guides` "⋯" → New page here → "Checklist" | Editor at `guides/Checklist.md` | US2-1, FR-013 |
| T14 | As carol, open the tree, right-click, press Shift+F10/F2/Delete | Only "Open"; F2/Delete do nothing; no drag handles | US2-4, FR-002 |
| T15 | Put the space in out-of-sync state (stop the remote) and open the menu as alice | Write actions disabled with the reason | FR-002 |
| T16 | Rename folder `guides` → `docs` | One commit; all pages moved; links from `index.md` and `service` space: `index.md` updated, `service` unchanged but `/s/handbook/guides/faq.md` redirects | US3-1, assumptions |
| T17 | Move folder `reference` into `reference/` subfolder via Move dialog and via drag | Destination disabled with explanation; drop not accepted | US3-3, US4-2 |
| T18 | Delete folder `archive/2019` | Dialog says "42 pages and 2 other files"; confirm → one commit; pages gone from tree; files still in `git log --all -- archive/2019` | US3-2, FR-015 |
| T19 | Open the delete dialog, push a new page into `archive/2019` via git, confirm | Dialog updates to the new count and asks again | R2 |
| T20 | Open a deleted page's address | "Page not found… view its history" link opens the history | Edge case "deleted" |
| T21 | Drag `guides/faq.md` onto the folder `reference` | Move dialog prefilled with `reference`; confirm → same result as T5 | US4-1, FR-017 |
| T22 | Drag `reference/api.md` above `reference/Installing.md` | Committed immediately; `reference/.order` lists the new order; toast | US5-2, FR-020 |
| T23 | Keyboard only: focus a page, Shift+F10 → Move up; → Move… → pick a folder → Enter | Same results as drag; focus stays on the item; live region announcements | US4, US5-1, FR-018, FR-022, SC-005 |
| T24 | Push an Azure DevOps-style `.order` to `guides` (`faq`, `Installing`, unknown `Ghost`), plus `guides/new.md` not listed | Tree: faq, Installing, then new; `Ghost` ignored | US5-3, US5-4, FR-019, SC-009 |
| T25 | Open a folder without `.order`, then Move down one item | Alphabetical at first; afterwards `.order` is created listing all items in the new order | US5-5, FR-020 |
| T26 | alice reorders `guides` while bob pushes `guides/zeta.md` | Both survive: alice's order plus `zeta` appended | Edge case "reorder vs add", R1 |
| T27 | Create a page and delete a page in a folder with `.order` | Entry appended / removed in the same commit | US5-6, FR-021 |
| T28 | Put garbage bytes in `.order` | Tree loads alphabetically | Edge case "malformed order" |
| T29 | Mobile viewport (375 px): open the navigation sheet, long-press an item | List scrolls; no drag; menu available via "⋯" | US4-3, FR-018 |
| T30 | Branch policy rejects pushes; try a move | Dialog callout with the reason; tree unchanged | Edge case "push rejected", FR-023 |
| T31 | Run the 002 WCAG scan with the menu, each dialog, and a drag in progress | 0 violations in both themes | FR-022, SC-005 |

## Automated checks

```bash
dotnet test                              # FolderOrder, LinkRewriter, MoveResolver, names; tree operation integration (temp bare remotes)
npm --prefix src/web test                # tree menu/keys, drop-zone geometry, dialogs, draft re-keying
npx --prefix tests/e2e playwright test --project=chromium   # T1–T31 automated parts (T11 on the Windows CI leg)
node tests/perf/tree-move.mjs   # SC-006 (new script next to run.mjs): 500-page folder in a 5 000-page space < 10 s
pwsh scripts/check-licenses.ps1          # no new dependencies expected
```

## Results (2026-10-19, Windows 11, Chromium)

| Check | Result |
|-------|--------|
| `Copernica.Tests` | 290 passed |
| `Copernica.IntegrationTests` | 190 passed (42 in `Tree/`) |
| Vitest | 75 passed |
| `us8-tree.spec.ts` run alone (scenarios T1–T13, T16–T25, T27–T30) | 23 passed |
| WCAG scan of the new screens (scenario T31) | 12 passed. It found low contrast on the dragged row, fixed by using an outline instead of transparency |
| `tests/perf/tree-move.mjs` (SC-006) | Passed: dry run 2.3 s, commit 9.7 s. Most of the commit time is writing loose objects on this machine |
| `scripts/check-licenses.ps1` | 266 shipped dependencies, all allowed; none added |
| Full Chromium e2e run | 154 passed (in two runs with fresh servers: images, diagrams and tree 50; all other specs 104). An earlier single background run crashed (`Target crashed`) when the machine ran low on memory |
| Not covered by e2e | T14 (read-only user) and T15 (out of sync), covered by Vitest and integration tests instead; T26 (reorder while a page is added), covered by integration tests |
