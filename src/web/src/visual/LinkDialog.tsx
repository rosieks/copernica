import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Schemas } from '../api/client';
import { useTree } from '../pages/SpaceLayout';
import { Button, Callout, Dialog, Field, ToggleGroup } from '../ui';
import { encodePath, isAllowedUrl } from './markdown/urls';

type TreeNode = Schemas['TreeNode'];

export interface PageEntry {
  title: string;
  path: string;
}

/** Every page of the tree, depth-first. */
export function flattenPages(root: TreeNode | undefined): PageEntry[] {
  const out: PageEntry[] = [];
  const walk = (node: TreeNode) => {
    for (const child of node.children ?? []) {
      if (child.kind === 'page') out.push({ title: child.title || child.name.replace(/\.md$/i, ''), path: child.path });
      walk(child);
    }
  };
  if (root) walk(root);
  return out;
}

export const MAX_RESULTS = 50;

/** Pages whose title or path contains the query, case-insensitively (contracts/ui.md §6). */
export function filterPages(pages: readonly PageEntry[], query: string): PageEntry[] {
  const q = query.trim().toLowerCase();
  const matches = q ? pages.filter((p) => p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)) : pages;
  return matches.slice(0, MAX_RESULTS);
}

/**
 * A relative link from one page to another, percent-encoded per segment: the form 003 uses for
 * images, which works in Azure DevOps and plain git tools and which 005 keeps up to date.
 */
export function relativeLink(fromPage: string, toPage: string): string {
  const from = fromPage.split('/').slice(0, -1);
  const to = toPage.split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const ups = from.length - common;
  return [...Array.from({ length: ups }, () => '..'), ...to.slice(common)].map((s) => (s === '..' ? s : encodePath(s))).join('/');
}

export interface LinkChoice {
  href: string;
  /** Text for the link when nothing is selected. */
  text: string;
}

interface Props {
  open: boolean;
  initialTab: 'page' | 'web';
  /** The current link target when the cursor is in a link. */
  current: string | null;
  spaceId: string;
  pagePath: string;
  onInsert: (choice: LinkChoice) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Link dialog with a page picker (contracts/ui.md §6, FR-022). */
export function LinkDialog({ open, initialTab, current, spaceId, pagePath, onInsert, onRemove, onClose }: Props) {
  const [tab, setTab] = useState<'page' | 'web'>(initialTab);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string>();
  const tree = useTree(spaceId);
  const pages = useMemo(() => flattenPages(tree.data?.root).filter((p) => p.path !== pagePath), [tree.data, pagePath]);
  const shown = useMemo(() => filterPages(pages, query), [pages, query]);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setQuery('');
    setIndex(0);
    setUrl(current ?? '');
    setUrlError(undefined);
  }, [open, initialTab, current]);

  useEffect(() => setIndex(0), [query]);

  const choosePage = (page: PageEntry | undefined) => {
    if (page) onInsert({ href: relativeLink(pagePath, page.path), text: page.title });
  };

  const onSearchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') setIndex((i) => Math.min(i + 1, Math.max(0, shown.length - 1)));
    else if (event.key === 'ArrowUp') setIndex((i) => Math.max(0, i - 1));
    else if (event.key === 'Enter') choosePage(shown[index]);
    else return;
    event.preventDefault();
  };

  const submitWeb = (event: FormEvent) => {
    // The dialog sits in a portal; its submit must not reach the page editor's form.
    event.preventDefault();
    event.stopPropagation();
    const value = url.trim();
    if (!value) return setUrlError('Enter a web address.');
    if (!isAllowedUrl(value, 'link') || !/^(https?:|mailto:)/i.test(value)) return setUrlError('Use an address that starts with https://, http:// or mailto:.');
    onInsert({ href: value, text: value.replace(/^mailto:/i, '') });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={current ? 'Edit link' : 'Insert link'}
      footer={
        <>
          {current && (
            <Button variant="danger" onClick={onRemove}>
              Remove link
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          {tab === 'web' && (
            <Button variant="primary" type="submit" form={`${listId}-web`}>
              {current ? 'Update link' : 'Insert link'}
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        <ToggleGroup<'page' | 'web'>
          label="Link to"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: 'page', label: 'Page in this space' },
            { value: 'web', label: 'Web address' },
          ]}
        />
        {tab === 'page' ? (
          <>
            <Field
              label="Find a page"
              type="text"
              autoComplete="off"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKey}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={shown[index] ? `${listId}-${index}` : undefined}
            />
            {tree.isError && <Callout tone="danger" title="The pages could not be loaded." />}
            <ul id={listId} role="listbox" aria-label="Pages" className="visual-link-pages">
              {shown.map((page, i) => (
                <li
                  key={page.path}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === index}
                  className="visual-link-pages__item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choosePage(page)}
                  onMouseEnter={() => setIndex(i)}
                >
                  <span className="visual-link-pages__title">{page.title}</span>
                  <span className="visual-link-pages__path mono muted">{page.path}</span>
                </li>
              ))}
            </ul>
            {!tree.isPending && shown.length === 0 && <p className="muted">No matching pages</p>}
          </>
        ) : (
          <form id={`${listId}-web`} onSubmit={submitWeb} noValidate>
            <Field
              label="Web address"
              type="url"
              autoFocus
              placeholder="https://"
              value={url}
              error={urlError}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(undefined);
              }}
            />
          </form>
        )}
      </div>
    </Dialog>
  );
}
