import { useState, type RefObject } from 'react';
import { DotsHorizontalIcon, DownloadIcon, Link2Icon, TrashIcon } from '@radix-ui/react-icons';
import { encodePath } from '../api/client';
import { fileApi, spaceRoute } from '../routes';
import { IconButton, Menu, Toolbar, useToast } from '../ui';
import { CopyLinkDialog } from './CopyLinkDialog';

export function canonicalUrl(spaceId: string, path: string, commitId: string, isCurrent: boolean): string {
  const route = isCurrent ? spaceRoute(spaceId, path) : `/s/${encodeURIComponent(spaceId)}/-/version/${commitId}/${encodePath(path)}`;
  return window.location.origin + route;
}

/** Copies with the Clipboard API; false when it is unavailable (non-secure context, refused). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

interface Props {
  spaceId: string;
  path: string;
  commitId: string;
  isCurrent: boolean;
  canDelete: boolean;
  onDelete: () => void;
  /** The "more actions" button; focus returns there from dialogs opened by this menu. */
  triggerRef: RefObject<HTMLButtonElement | null>;
}

/** The page "more actions" menu (FR-022, FR-023). */
export function PageActions({ spaceId, path, commitId, isCurrent, canDelete, onDelete, triggerRef }: Props) {
  const { notify } = useToast();
  const [fallbackUrl, setFallbackUrl] = useState<string>();
  const fileName = path.split('/').pop() ?? 'page.md';

  async function copyLink() {
    const url = canonicalUrl(spaceId, path, commitId, isCurrent);
    if (await copyText(url)) notify({ tone: 'success', title: 'Link copied' });
    else setFallbackUrl(url);
  }

  return (
    <>
      <Menu.Root>
        <Menu.Trigger asChild>
          <Toolbar.Button asChild>
            <IconButton ref={triggerRef} label="More page actions" icon={<DotsHorizontalIcon />} variant="secondary" />
          </Toolbar.Button>
        </Menu.Trigger>
        <Menu.Content label="Page actions">
          <Menu.Item icon={<Link2Icon />} onSelect={() => void copyLink()}>
            Copy link
          </Menu.Item>
          <Menu.Item asChild>
            <a href={fileApi(spaceId, path, commitId)} download={fileName}>
              <span className="ui-menu__icon" aria-hidden="true">
                <DownloadIcon />
              </span>
              Download Markdown
            </a>
          </Menu.Item>
          {canDelete && (
            <>
              <Menu.Separator />
              <Menu.Item tone="danger" icon={<TrashIcon />} onSelect={onDelete}>
                Delete page…
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Root>
      <CopyLinkDialog
        url={fallbackUrl ?? ''}
        open={!!fallbackUrl}
        onOpenChange={(open) => !open && setFallbackUrl(undefined)}
        returnFocusTo={triggerRef}
      />
    </>
  );
}
