import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { schema } from './markdown/schema';

/**
 * State of the "/" command menu (contracts/ui.md §4). It opens when "/" is typed into an empty
 * paragraph and follows the typed query until the cursor leaves it, the text stops starting
 * with "/", or the menu is closed.
 */
export interface SlashState {
  active: boolean;
  /** Position of the "/" character. */
  from: number;
  query: string;
}

const inactive: SlashState = { active: false, from: 0, query: '' };

export const slashKey = new PluginKey<SlashState>('slash');

export function slashState(state: EditorState): SlashState {
  return slashKey.getState(state) ?? inactive;
}

/** Transaction meta that closes the menu and keeps the typed text (Esc). */
export const CLOSE_SLASH = inactive;

export function slashPlugin(): Plugin<SlashState> {
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => inactive,
      apply(tr, prev, _old, next) {
        const meta = tr.getMeta(slashKey) as SlashState | undefined;
        if (meta) return meta;
        if (!prev.active) return prev;
        const from = tr.mapping.map(prev.from);
        const { $from, empty } = next.selection;
        if (!empty || $from.pos <= from || $from.parent.type !== schema.nodes.paragraph || $from.start() !== from) return inactive;
        const text = next.doc.textBetween(from, $from.pos, '\n', '\n');
        if (!text.startsWith('/') || text.includes('\n') || text.length > 40) return inactive;
        return { active: true, from, query: text.slice(1) };
      },
    },
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '/') return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type !== schema.nodes.paragraph || $from.parent.content.size !== 0) return false;
        view.dispatch(view.state.tr.insertText('/', from, to).setMeta(slashKey, { active: true, from, query: '' }));
        return true;
      },
    },
  });
}
