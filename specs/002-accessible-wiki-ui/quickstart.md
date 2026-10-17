# Quickstart & Validation: Consistent, Accessible Wiki Interface

Runnable scenarios that prove the feature end to end. Expected UI behaviour is defined in
[contracts/ui.md](contracts/ui.md), API additions in
[contracts/api-changes.md](contracts/api-changes.md), and client state in
[data-model.md](data-model.md). Requirement IDs refer to [spec.md](spec.md).

## Prerequisites and setup

Use the local evaluation setup from
[001 quickstart, section A](../001-git-backed-team-wiki/quickstart.md#a-local-evaluation-no-external-services):
`Local` auth, users alice and bob, and two `Git` spaces. Then add:

- a third user, carol, who can only read: a `Git` space configured read-only for carol
  through the test hosting fixture, or the fake hosting provider in e2e;
- in `handbook`: a page with a wide table and a long code line, a page larger than the
  size limit, and a page with at least three commits by different authors.

```bash
npm --prefix src/web run build && dotnet run --project src/Copernica -- <001 section A arguments>
# open http://127.0.0.1:8080  (a secure context, so the Clipboard API is available)
# for the clipboard fallback (V12) open it through a non-localhost host name over plain HTTP
```

## Scenarios

### US1: state and feedback

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V1 | As alice open a page, then *History* → an old version | "Older version from `<date>` by `<author>`" indicator with *Go to current version*; the PageInfo line describes that version | US1-1, US5-2, FR-004 |
| V2 | Make `service.git` unreachable (rename it); open a `service` page | "Could not be synchronized since `<time>`" indicator; with V1's old version also open in `service`, both indicators are visible | US1-2, US1-7 |
| V3 | As carol open a `handbook` page | "Read only" indicator; no Edit or Delete; pressing `e` does nothing | US1-3 |
| V4 | As alice edit and save | Toast "Saved" announced by a screen reader (NVDA/VoiceOver), visible ≥ 5 s, pauses while hovered, dismissible | US1-4, FR-006 |
| V5 | Repeat 001 A9 (bob saves a non-overlapping change after alice) | bob's Toast: "Saved — merged with changes by alice" | US1-5, FR-007 |
| V6 | Protect the branch (or use the push-rejecting fixture); save | Inline error with the reason above the footer; text kept; error stays until dismissed or retried | US1-6, FR-008 |

### US2: screen sizes

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V7 | Open a page with discussions at 1280, 1000 and 320 px | 3 columns → tree + page with a *Discussions (n)* toggle → page only with tree and discussions buttons; closing a sheet returns focus to its button | US2-1..3, FR-010, FR-011 |
| V8 | At 320 px open the wide-table page | Only the table and the code block scroll horizontally; `scrollWidth ≤ innerWidth` | US2-4, FR-009 |
| V9 | At 320 px edit, preview and save a page; open history and compare; resolve a conflict (001 A10) | All tasks complete; no horizontal page scroll | US2-5, SC-003 |

### US3: keyboard

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V10 | Without a mouse: Tab from load → skip link → tree → open page → `e` → edit → `Ctrl/⌘+S` with empty description → fill → `Ctrl/⌘+S` | Skip link first; focus always visible; the first save focuses the description with an error; the second save succeeds; after navigation focus is on the `<h1>` | US3-1, 3, 4, FR-012, FR-013 |
| V11 | Open the page `⋯` menu → *Delete page…* → `Esc`; open *New page* → `Esc`; press `?` | Focus returns to `⋯` and to *New page*; the help lists the current screen's shortcuts | US3-2, US3-5, FR-014, FR-015 |
| V12 | Turn off single-key shortcuts in Profile; press `e`, `?`, then `Ctrl/⌘+S` in the editor | `e` and `?` do nothing; save works; the setting persists after reload and in a second tab | US3-6, FR-017 |
| V13 | Tab to a discussion highlight and press `Enter`; type `e` inside the comment box | The thread opens; typing inserts "e" and does not trigger edit | US3-7, FR-016, FR-018 |

### US4: commenting on a selection

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V14 | Select a sentence with the mouse | The *Comment* popover appears next to it; focus stays in the page | US4-1, FR-019 |
| V15 | Click *Comment*, type, press `Ctrl/⌘+Enter` | Discussion created and highlighted; at most 2 interactions after selecting; < 10 s | US4-2, US4-3, SC-005 |
| V16 | Select with `Shift+→` (caret browsing on), press `c` | Composer opens with the quote | US4-2, FR-015 |
| V17 | Select across the article and the tree; then make a valid selection and press `Esc`, then scroll it out of view | No popover for the cross-boundary selection; the popover closes on `Esc` and on scroll-out | US4-4, US4-5, FR-020 |
| V18 | On a touch device (or Playwright mobile emulation) long-press a word and extend the selection | Popover below the selection, not covering the OS menu | Edge case (touch) |

### US5: page information and actions

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V19 | Open the multi-author page; compare with `git log -1 -- <file>` on the remote | Same author, description; relative time with the exact time in a Tooltip on hover *and* on keyboard focus | US5-1, FR-021 |
| V20 | Throttle the network (DevTools "Slow 3G") and reload | Article appears first; the PageInfo line fills in afterwards | FR-024, SC-008 |
| V21 | *Copy link* on the current page and on an old version; paste each into a new tab | Toast "Link copied"; the links open the same page / the same version | US5-3, FR-022 |
| V22 | Open the wiki over plain HTTP on a non-localhost host; *Copy link* | Dialog with the URL pre-selected in a read-only field | US5-4 |
| V23 | *Download Markdown* on a normal page, an old version and the too-large page | `.md` file with the page's file name and the shown version's content | US5-5, FR-023 |

### US6: theme

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V24 | With the editor open and unsaved text, switch the OS between light and dark | Switch within 1 s, no reload, text and focus kept; editor, diff, page content and highlights all themed | US6-1, US6-2, FR-025, FR-026, SC-007 |

### Cross-cutting

| # | Steps | Expected | Covers |
|---|-------|----------|--------|
| V25 | Automated WCAG 2.1 AA scan of S1–S7, the shortcut help and an open dialog, in light and dark, at 1280 and 320 px | 0 violations | SC-001, FR-027 |
| V26 | Visit all screens, open every overlay type, show a Toast | 0 `securitypolicyviolation` events; the shell CSP has a per-request `style-src` nonce that matches the `<meta>`; `/api/*` keeps the static CSP | FR-030, research R3 |
| V27 | OS "reduce motion" on; open a dialog, a sheet and a Toast | No animation | FR-028 |
| V28 | Build; run the license check; search `dist/` for `http(s)://` | Only allowed licenses shipped. The only URLs are XML/SVG namespaces and text inside React and React Router error messages (`react.dev/errors`, `reactrouter.com`, also present before 002). None is ever requested | FR-029, Principles II/IV |
| V29 | Repeat 001 A1–A15 | All still pass (no regression; routes unchanged) | Spec Assumptions |

## Automated checks

```bash
dotnet test                                # + history `version`, `mergedAuthors`, shell nonce tests (api-changes.md)
npm --prefix src/web test                  # ui/ wrappers, useShortcuts, selection popover, PageInfo
npx --prefix tests/e2e playwright test     # 001 A-scenarios + V1–V27 (themes, viewports, reduced motion, WCAG scan)
pwsh scripts/check-licenses.ps1            # V28
```

Manual only: V4's screen-reader announcement (spot check with NVDA or VoiceOver), V18
on a real touch device, V22 (needs a non-localhost plain-HTTP host), and SC-004 (a
usability session with 10 participants).
