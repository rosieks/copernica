import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { schema } from './markdown/schema';
import { isAllowedUrl, isExternal, normalizeDestination } from './markdown/urls';

/**
 * Pasting formatted content (research R12, FR-024). ProseMirror parses clipboard HTML in a
 * detached document and keeps only what the schema's `parseDOM` rules match (no styles, no
 * event handlers, no raw HTML). On top of that, Office debris is removed first, and images
 * that are only addresses of other sites are dropped and reported.
 */

/** Removes what Word and other office tools add around the content. */
export function cleanPastedHtml(html: string): string {
  return html
    .replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script|meta|link|title|xml|template)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<(meta|link)\b[^>]*>/gi, '')
    .replace(/<\/?o:p\b[^>]*>/gi, '')
    .replace(/<\/?(w|m|v):[a-z]+\b[^>]*>/gi, '');
}

/** True for image sources pasted content may keep: files of this wiki, by relative path. */
function keepImage(src: string): boolean {
  const target = normalizeDestination(src);
  if (!target || isExternal(target) || target.startsWith('data:') || target.startsWith('blob:')) return false;
  return isAllowedUrl(target, 'image');
}

function stripFragment(fragment: Fragment, dropped: { count: number }): Fragment {
  const children: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.type === schema.nodes.image && !keepImage(node.attrs.src as string)) {
      dropped.count++;
      return;
    }
    if (node.isText) {
      // Links with schemes the wiki does not allow lose their address but keep their text.
      const link = node.marks.find((m) => m.type === schema.marks.link);
      if (link && !isAllowedUrl(link.attrs.href as string, 'link')) {
        children.push(node.mark(link.removeFromSet(node.marks)));
        return;
      }
      children.push(node);
      return;
    }
    children.push(node.copy(stripFragment(node.content, dropped)));
  });
  return Fragment.fromArray(children);
}

/** Removes external images and disallowed links from a pasted slice; returns how many images went. */
export function cleanPastedSlice(slice: Slice): { slice: Slice; droppedImages: number } {
  const dropped = { count: 0 };
  const content = stripFragment(slice.content, dropped);
  return { slice: new Slice(content, slice.openStart, slice.openEnd), droppedImages: dropped.count };
}

const URL_TEXT = /^(https?:\/\/|mailto:)\S+$/i;

export function pastePlugin(onAnnounce: (text: string) => void): Plugin {
  return new Plugin({
    props: {
      transformPastedHTML: cleanPastedHtml,
      transformPasted(slice) {
        const { slice: cleaned, droppedImages } = cleanPastedSlice(slice);
        if (droppedImages > 0) {
          onAnnounce(
            `${droppedImages} ${droppedImages === 1 ? 'image' : 'images'} from other sites ${droppedImages === 1 ? 'was' : 'were'} not inserted — paste or upload the image files instead.`,
          );
        }
        return cleaned;
      },
      handlePaste(view, event) {
        // A web address pasted over selected text turns the text into a link.
        const text = event.clipboardData?.getData('text/plain')?.trim() ?? '';
        const { empty, from, to } = view.state.selection;
        if (empty || !URL_TEXT.test(text) || !isAllowedUrl(text, 'link')) return false;
        if (event.clipboardData?.getData('text/html')) return false;
        view.dispatch(view.state.tr.addMark(from, to, schema.marks.link.create({ href: text, form: 'inline' })));
        return true;
      },
    },
  });
}
