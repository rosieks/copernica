import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-tables/style/tables.css';
import 'prosemirror-gapcursor/style/gapcursor.css';
import {
  insertCodeCommand,
  insertDiagramCommand,
  insertRuleCommand,
  insertTableCommand,
  setBlockCommand,
  toggleListCommand,
  toggleQuoteCommand,
} from './commands';
import { parse, serialize, type SourceSnapshot } from './markdown';
import type { PendingImage } from './markdown/urls';
import { DiagramDialog, NEW_DIAGRAM } from './DiagramDialog';
import { ImageBar } from './ImageBar';
import { pastePlugin } from './paste';
import { LinkDialog } from './LinkDialog';
import { linkAt, removeLinkCommand, setLinkCommand } from './links';
import { normalizeDestination, resolvePageHref } from './markdown/urls';
import { createNodeViews } from './nodeViews';
import { editorPlugins } from './plugins';
import { slashPlugin } from './slash';
import { SlashMenu, type SlashController, type SlashItem } from './SlashMenu';
import { Toolbar, type EditorActions } from './Toolbar';
import { blockPath, offsetForPath, positionForOffset } from './markdown/cursor';
import type { ImageTarget } from '../editor/imageTarget';
import { imageInputPlugin, visualTarget } from './imageInput';
import './visual.css';

/** What the page editor can ask of the visual editor. */
export interface VisualEditorHandle {
  view: EditorView;
  /** Where the image flow puts placeholders and images (003, FR-020). */
  imageTarget: ImageTarget;
  /** Serializes pending changes now and returns the Markdown (before save, review, mode switch). */
  flush: () => string;
  focus: () => void;
  /** Offset in the Markdown of the block holding the cursor (mode switch, contracts/fidelity.md M2). */
  getCursorOffset: () => number;
  setCursorOffset: (offset: number) => void;
}

interface Props {
  value: string;
  onChange: (markdown: string) => void;
  label: string;
  spaceId: string;
  pagePath: string;
  pending: readonly PendingImage[];
  editorRef?: MutableRefObject<VisualEditorHandle | null>;
  onAnnounce: (text: string) => void;
  /** The page cannot be kept byte for byte; the caller falls back to Markdown mode (FR-019). */
  onGuardFailure: () => void;
  actions?: EditorActions;
  /** Pasted or dropped files and where they go (003). */
  onFiles?: (files: File[], pos: number) => void;
}

const SERIALIZE_DELAY = 200;

/** The visual (WYSIWYG) editor of 007. Its document is always derived from Markdown and written back to it. */
export default function VisualEditor({ value, onChange, label, spaceId, pagePath, pending, editorRef, onAnnounce, onGuardFailure, actions = {}, onFiles }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const snapshot = useRef<SourceSnapshot | null>(null);
  const emitted = useRef<string>(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const slashController = useRef<SlashController | null>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  const callbacks = useRef({ onChange, onAnnounce, onGuardFailure, actions, onFiles });
  callbacks.current = { onChange, onAnnounce, onGuardFailure, actions, onFiles };
  const editDiagramRef = useRef<(pos: number) => void>(() => {});
  const [state, setState] = useState<EditorState | null>(null);
  const [failed, setFailed] = useState(false);
  /** The diagram being edited: its position, or null for a new one (contracts/ui.md §8). */
  const [diagram, setDiagram] = useState<{ pos: number | null; source: string } | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ tab: 'page' | 'web' } | null>(null);

  const closeLink = () => {
    setLinkDialog(null);
    viewRef.current?.focus();
  };

  const editDiagram = (pos: number) => {
    const node = viewRef.current?.state.doc.nodeAt(pos);
    if (node?.type.name === 'diagram') setDiagram({ pos, source: node.attrs.source as string });
  };

  const applyDiagram = (source: string) => {
    const view = viewRef.current;
    const editing = diagram;
    setDiagram(null);
    if (!view || !editing) return;
    if (editing.pos === null) {
      insertDiagramCommand(source)(view.state, view.dispatch, view);
      callbacks.current.onAnnounce('Diagram inserted');
    } else {
      const node = view.state.doc.nodeAt(editing.pos);
      if (node?.type.name === 'diagram') view.dispatch(view.state.tr.setNodeMarkup(editing.pos, undefined, { ...node.attrs, source }));
    }
    view.focus();
  };

  editDiagramRef.current = editDiagram;

  // The diagram and link dialogs belong to the editor itself.
  const allActions: EditorActions = {
    ...actions,
    onDiagram: () => setDiagram({ pos: null, source: NEW_DIAGRAM }),
    onLink: (tab) => {
      const view = viewRef.current;
      const existing = view ? linkAt(view.state) : null;
      const href = existing ? (existing.mark.attrs.href as string) : null;
      setLinkDialog({ tab: tab ?? (href && /^(https?:|mailto:)/i.test(normalizeDestination(href)) ? 'web' : 'page') });
    },
  };
  const actionsRef = useRef(allActions);
  actionsRef.current = allActions;

  /** Writes the document back to Markdown and reports it when it differs from the last report. */
  const flush = (): string => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const view = viewRef.current;
    if (!view || !snapshot.current) return emitted.current;
    const markdown = serialize(view.state.doc, snapshot.current);
    if (markdown !== emitted.current) {
      emitted.current = markdown;
      callbacks.current.onChange(markdown);
    }
    return markdown;
  };

  const load = (markdown: string): EditorState | null => {
    // Load-time guard (research R4): only pages that come back byte for byte are edited visually.
    // `__copernicaVisualGuard = false` is an e2e test hook (quickstart W10); it can only make the
    // editor fall back to Markdown mode.
    const forced = (window as { __copernicaVisualGuard?: boolean }).__copernicaVisualGuard === false;
    if (forced) return null;
    // One parse serves both the guard and the editor (large pages, SC-005).
    let parsed: ReturnType<typeof parse>;
    try {
      parsed = parse(markdown);
      if (serialize(parsed.doc, parsed.snapshot) !== markdown) return null;
    } catch {
      return null;
    }
    snapshot.current = parsed.snapshot;
    emitted.current = markdown;
    return EditorState.create({
      doc: parsed.doc,
      plugins: [
        ...editorPlugins({ style: parsed.snapshot.style, onLink: () => actionsRef.current.onLink?.() }),
        slashPlugin(),
        imageInputPlugin((files, pos) => callbacks.current.onFiles?.(files, pos)),
        pastePlugin((text) => callbacks.current.onAnnounce(text)),
      ],
    });
  };

  useEffect(() => {
    const initial = load(value);
    if (!initial) {
      setFailed(true);
      callbacks.current.onGuardFailure();
      return;
    }
    const view = new EditorView(mount.current!, {
      state: initial,
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, class: 'visual-editor__content prose' },
      nodeViews: createNodeViews({ spaceId, pagePath, pending: () => pendingRef.current, onEditDiagram: (pos) => editDiagramRef.current(pos) }),
      handleKeyDown: (editorView, event) => {
        if (slashController.current?.onKeyDown(event)) return true;
        // Enter on a selected diagram opens it for editing.
        const selection = editorView.state.selection;
        if (event.key === 'Enter' && selection instanceof NodeSelection && selection.node.type.name === 'diagram') {
          editDiagramRef.current(selection.from);
          return true;
        }
        return false;
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr);
        view.updateState(next);
        setState(next);
        if (tr.docChanged) {
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, SERIALIZE_DELAY);
        }
      },
    });
    viewRef.current = view;
    setState(view.state);
    return () => {
      // Pending changes are reported before the editor goes away (mode switch, navigation).
      flush();
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns its document; external replacements are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The page editor replaced the text (discarded draft, conflict outcome): start over from it.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || value === emitted.current) return;
    clearTimeout(timer.current);
    const next = load(value);
    if (!next) {
      setFailed(true);
      callbacks.current.onGuardFailure();
      return;
    }
    view.updateState(next);
    setState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!editorRef) return;
    editorRef.current = viewRef.current
      ? {
          view: viewRef.current,
          imageTarget: visualTarget(viewRef.current),
          flush,
          focus: () => viewRef.current?.focus(),
          getCursorOffset: () => {
            const view = viewRef.current;
            if (!view) return 0;
            // Offsets of the current text: parse what was just written and follow the same path.
            const path = blockPath(view.state.doc, view.state.selection.from);
            const fresh = parse(flush());
            return offsetForPath(fresh.doc, fresh.snapshot, path);
          },
          setCursorOffset: (offset: number) => {
            const view = viewRef.current;
            if (!view || !snapshot.current) return;
            const pos = positionForOffset(view.state.doc, snapshot.current, offset);
            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))).scrollIntoView());
          },
        }
      : null;
    return () => {
      if (editorRef.current?.view === viewRef.current) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state !== null]);

  const style = snapshot.current?.style;
  const slashItems = useMemo<SlashItem[]>(() => {
    if (!style) return [];
    const command = (c: Parameters<typeof runCommand>[1]) => (view: EditorView) => runCommand(view, c);
    const items: SlashItem[] = [
      { id: 'h1', label: 'Heading 1', keywords: 'h1 title', run: command(setBlockCommand('heading1')) },
      { id: 'h2', label: 'Heading 2', keywords: 'h2', run: command(setBlockCommand('heading2')) },
      { id: 'h3', label: 'Heading 3', keywords: 'h3', run: command(setBlockCommand('heading3')) },
      { id: 'bullet', label: 'Bulleted list', keywords: 'ul unordered', run: command(toggleListCommand('bullet', style)) },
      { id: 'ordered', label: 'Numbered list', keywords: 'ol ordered', run: command(toggleListCommand('ordered', style)) },
      { id: 'task', label: 'Task list', keywords: 'todo checkbox', run: command(toggleListCommand('task', style)) },
      { id: 'table', label: 'Table', keywords: 'grid', run: command(insertTableCommand()) },
      { id: 'quote', label: 'Quote', keywords: 'blockquote', run: command(toggleQuoteCommand) },
      { id: 'code', label: 'Code block', keywords: 'pre', run: command(insertCodeCommand()) },
    ];
    items.push({ id: 'diagram', label: 'Diagram', keywords: 'mermaid chart', run: () => actionsRef.current.onDiagram?.() });
    if (actions.onImage) items.push({ id: 'image', label: 'Image', keywords: 'picture screenshot', run: () => actionsRef.current.onImage?.() });
    items.push({ id: 'rule', label: 'Horizontal rule', keywords: 'divider hr line', run: command(insertRuleCommand()) });
    items.push({ id: 'link', label: 'Link to page', keywords: 'wiki page', run: () => actionsRef.current.onLink?.('page') });
    return items;
  }, [style, actions.onImage]);

  if (failed) return null;

  const view = viewRef.current;
  return (
    <div className="visual-editor" ref={wrapper}>
      {view && state && style && <Toolbar view={view} state={state} style={style} actions={allActions} onAnnounce={onAnnounce} />}
      <div className="visual-editor__frame">
        <div ref={mount} />
        {view && state && <SlashMenu view={view} state={state} items={slashItems} controller={slashController} container={wrapper.current} />}
      </div>
      {view && state && <LinkBar view={view} state={state} container={wrapper.current} spaceId={spaceId} pagePath={pagePath} onEdit={() => allActions.onLink?.()} onAnnounce={onAnnounce} />}
      {view && state && <ImageBar view={view} state={state} container={wrapper.current} onAnnounce={onAnnounce} />}
      <DiagramDialog
        source={diagram?.source ?? null}
        onApply={applyDiagram}
        onCancel={() => {
          setDiagram(null);
          viewRef.current?.focus();
        }}
      />
      <LinkDialog
        open={linkDialog !== null}
        initialTab={linkDialog?.tab ?? 'page'}
        current={state ? ((linkAt(state)?.mark.attrs.href as string | undefined) ?? null) : null}
        spaceId={spaceId}
        pagePath={pagePath}
        onInsert={(choice) => {
          const view = viewRef.current;
          if (view) setLinkCommand(choice.href, choice.text)(view.state, view.dispatch, view);
          onAnnounce('Link inserted');
          closeLink();
        }}
        onRemove={() => {
          const view = viewRef.current;
          if (view) removeLinkCommand(view.state, view.dispatch, view);
          onAnnounce('Link removed');
          closeLink();
        }}
        onClose={closeLink}
      />
    </div>
  );
}

/** Shows where the link at the cursor goes, with Open, Edit and Remove (US4-4). */
function LinkBar({
  view,
  state,
  container,
  spaceId,
  pagePath,
  onEdit,
  onAnnounce,
}: {
  view: EditorView;
  state: EditorState;
  container: HTMLElement | null;
  spaceId: string;
  pagePath: string;
  onEdit: () => void;
  onAnnounce: (text: string) => void;
}) {
  const link = state.selection.empty ? linkAt(state) : null;
  if (!link || !container || !view.hasFocus()) return null;
  const href = link.mark.attrs.href as string;
  const target = resolvePageHref(href, spaceId, pagePath);
  const coords = view.coordsAtPos(link.from);
  const box = container.getBoundingClientRect();
  const position = { left: `${Math.max(0, coords.left - box.left)}px`, top: `${coords.bottom - box.top + 4}px` };
  return (
    <div className="visual-linkbar" style={position} role="group" aria-label="Link">
      <span className="visual-linkbar__target mono">{normalizeDestination(href) || '(no address)'}</span>
      {target && (
        <a className="ui-button ui-button--ghost ui-button--sm" href={target} target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.preventDefault()}>
          Open
        </a>
      )}
      <button type="button" className="ui-button ui-button--ghost ui-button--sm" onMouseDown={(e) => e.preventDefault()} onClick={onEdit}>
        Edit link
      </button>
      <button
        type="button"
        className="ui-button ui-button--ghost ui-button--sm"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          removeLinkCommand(view.state, view.dispatch, view);
          onAnnounce('Link removed');
        }}
      >
        Remove link
      </button>
    </div>
  );
}

function runCommand(view: EditorView, command: (state: EditorState, dispatch?: EditorView['dispatch'], view?: EditorView) => boolean) {
  command(view.state, view.dispatch, view);
}
