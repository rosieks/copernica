# Contract: `.order` Files

Compatible with Azure DevOps Wiki. Read when building the tree, and written by tree
operations (research R8).

## Location and encoding

- One optional file named `.order` in any folder of a space, including the space root
  (the space's configured folder within the repository).
- UTF-8 text, with or without BOM. Line endings `\n` or `\r\n`. At most 64 KiB, otherwise
  the file is ignored.
- `.order` is never shown as a page. It cannot be the name of a page or folder created
  through the wiki.

## Content

```
Overview
Getting-started
api
Reference
```

- One entry per line. Leading and trailing whitespace is trimmed and blank lines are
  ignored.
- An entry is the **file name of a page without `.md`** (`Getting-started` for
  `Getting-started.md`) or the **name of a subfolder** (`api`).
- An entry that matches both a page `X.md` and a folder `X/` (the Azure DevOps subpage
  layout) places both: the page first, the folder right after.

## Reading rules

1. Match each entry against the folder's children: exact match first, then
   case-insensitive (ordinal).
2. Listed children come first, in entry order. The first occurrence wins for duplicates.
3. Entries that match nothing are ignored.
4. Unlisted children follow in the default order: folders, then pages, each sorted
   case-insensitively by name (as without a file).

## Writing rules

The wiki edits a file only as part of a tree operation's commit, and minimally:

| Operation | Change |
|-----------|--------|
| Reorder in a folder without a file | Create the file listing **all** current children in the new order |
| Reorder in a folder with a file | Rewrite the listing so that all current children appear in the new order; keep unknown entries at their positions relative to their neighbours |
| Create page or folder (file exists) | Append the entry at the end |
| Delete page or folder | Remove the matching line |
| Rename | Replace the matching line in place |
| Move to another folder | Remove from the source file; append to the destination file if it has one |
| Folder moved or deleted | Its own `.order` moves or is deleted with it |

The wiki never creates a file except on reorder. New and changed lines use the line ending
of the file's first line (`\n` for new files), and the file ends with a newline.
