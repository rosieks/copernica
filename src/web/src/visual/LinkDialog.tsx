import { useEffect, useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Schemas } from '../api/client';
import { useTree } from '../pages/SpaceLayout';
import { usePage } from '../pages/PageView';
import { sectionHash } from '../sections/resolveSection';
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

type Section = Schemas['Section'];

/** Sections whose text contains the query, case-insensitively (009 contracts/ui.md). */
export function filterSections(sections: readonly Section[], query: string): Section[] {
  const q = query.trim().toLowerCase();
  return q ? sections.filter((s) => s.text.toLowerCase().includes(q)) : [...sections];
}

/** The link to a page or one of its sections; a section of the page being edited is just `#id`. */
export function sectionLink(fromPage: string, toPage: string, section: Section | null): string {
  if (toPage === fromPage) return section ? sectionHash(section.id) : '';
  return relativeLink(fromPage, toPage) + (section ? sectionHash(section.id) : '');
}

/** The sections of the chosen page: a saved page from the page query, this page from its current text. */
function useSections(spaceId: string, pagePath: string, chosen: PageEntry | null, getMarkdown: () => string) {
  const other = chosen !== null && chosen.path !== pagePath;
  const saved = usePage(spaceId, other ? chosen.path : pagePath, undefined, other);
  const markdown = useMemo(() => (chosen && !other ? getMarkdown() : ''), [chosen, other, getMarkdown]);
  const current = useQuery({
    queryKey: ['link-sections', spaceId, pagePath, markdown],
    enabled: chosen !== null && !other,
    queryFn: () => api<{ html: string; sections: Section[] }>('/api/render', { method: 'POST', json: { spaceId, path: pagePath, markdown } }),
  });
  const result = other ? saved : current;
  const unavailable = result.isError || (other && saved.data?.tooLarge === true);
  return { sections: result.data?.sections ?? [], loading: result.isPending, unavailable };
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
  /** The current text of the page being edited, for its own sections (009). */
  getMarkdown: () => string;
  onInsert: (choice: LinkChoice) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Link dialog with a page picker (contracts/ui.md §6, FR-022). */
export function LinkDialog({ open, initialTab, current, spaceId, pagePath, getMarkdown, onInsert, onRemove, onClose }: Props) {
  const [tab, setTab] = useState<'page' | 'web'>(initialTab);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string>();
  const tree = useTree(spaceId);
  const pages = useMemo(() => flattenPages(tree.data?.root).filter((p) => p.path !== pagePath), [tree.data, pagePath]);
  // "This page" comes first, for links to its own sections (009 US3).
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = filterPages(pages, query);
    return !q || 'this page'.includes(q) ? [{ title: 'This page', path: pagePath }, ...matches] : matches;
  }, [pages, pagePath, query]);
  const listId = useId();
  const [chosen, setChosen] = useState<PageEntry | null>(null);
  const [sectionQuery, setSectionQuery] = useState('');
  const [sectionIndex, setSectionIndex] = useState(0);
  const sections = useSections(spaceId, pagePath, chosen, getMarkdown);
  const isThisPage = chosen?.path === pagePath;
  // "Whole page" (null) comes first, except for the page being edited.
  const sectionOptions = useMemo<(Section | null)[]>(
    () => [...(isThisPage || sectionQuery.trim() ? [] : [null]), ...filterSections(sections.sections, sectionQuery)],
    [isThisPage, sections.sections, sectionQuery],
  );

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setQuery('');
    setIndex(0);
    setUrl(current ?? '');
    setUrlError(undefined);
    setChosen(null);
  }, [open, initialTab, current]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => setSectionIndex(0), [sectionQuery, chosen]);

  // Choosing a page leads to its sections; "Whole page" is the default (009 contracts/ui.md).
  const choosePage = (page: PageEntry | undefined) => {
    if (!page) return;
    setSectionQuery('');
    setChosen(page);
  };

  const chooseSection = (section: Section | null | undefined) => {
    if (!chosen || section === undefined || (section === null && isThisPage)) return;
    onInsert({ href: sectionLink(pagePath, chosen.path, section), text: section?.text ?? chosen.title });
  };

  const onSectionKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') setSectionIndex((i) => Math.min(i + 1, Math.max(0, sectionOptions.length - 1)));
    else if (event.key === 'ArrowUp') setSectionIndex((i) => Math.max(0, i - 1));
    else if (event.key === 'Enter') chooseSection(sectionOptions[sectionIndex]);
    else return;
    event.preventDefault();
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
        {tab === 'page' && chosen ? (
          <>
            <div className="visual-link-chosen">
              <span>
                Page: <strong>{chosen.title}</strong>
              </span>
              <Button size="sm" onClick={() => setChosen(null)}>
                Change page
              </Button>
            </div>
            <Field
              label={isThisPage ? 'Find a section' : 'Section (optional)'}
              type="text"
              autoComplete="off"
              autoFocus
              value={sectionQuery}
              onChange={(e) => setSectionQuery(e.target.value)}
              onKeyDown={onSectionKey}
              role="combobox"
              aria-expanded="true"
              aria-controls={`${listId}-sections`}
              aria-autocomplete="list"
              aria-activedescendant={sectionOptions.length > sectionIndex ? `${listId}-s${sectionIndex}` : undefined}
            />
            {sections.unavailable ? (
              <p className="muted">Sections are not available.</p>
            ) : (
              sections.loading && <p className="muted">Loading sections…</p>
            )}
            <ul id={`${listId}-sections`} role="listbox" aria-label="Sections" className="visual-link-pages">
              {sectionOptions.map((section, i) => (
                <li
                  key={section?.id ?? ''}
                  id={`${listId}-s${i}`}
                  role="option"
                  aria-selected={i === sectionIndex}
                  className={`visual-link-pages__item visual-link-sections__item--level-${section?.level ?? 0}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => chooseSection(section)}
                  onMouseEnter={() => setSectionIndex(i)}
                >
                  <span className="visual-link-pages__title">
                    {section ? section.text : 'Whole page'}
                    {section && <span className="visually-hidden">, heading level {section.level}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {!sections.loading && sectionOptions.length === 0 && <p className="muted">No matching sections</p>}
          </>
        ) : tab === 'page' ? (
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
