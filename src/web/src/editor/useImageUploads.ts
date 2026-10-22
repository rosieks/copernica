import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { DraftAttachment } from '../drafts';
import { imageMarkdown } from './altText';
import type { ImageTarget } from './imageTarget';
import { checkFile, uploadErrorText, uploadImage, type UploadLimits } from './uploads';

export interface UploadRow {
  key: string;
  name: string;
  progress: number;
}

export interface Rejection {
  key: string;
  name: string;
  reason: string;
}

interface Completed {
  key: string;
  attachment: DraftAttachment;
}

let counter = 0;

interface Options {
  spaceId: string;
  path: string;
  limits: UploadLimits;
  /** The editor that shows placeholders and receives the images (Markdown or visual, 007). */
  target: MutableRefObject<ImageTarget | null>;
  /** A finished upload joins the edit's pending images. */
  onAttachment: (attachment: DraftAttachment) => void;
  /** Used when the placeholder is gone (e.g. the editor tab was switched): append instead. */
  onAppend: (markdown: string) => void;
}

/**
 * The editor's image flow (003 contracts/ui.md): check → placeholder → upload with progress →
 * describe → replace the placeholder with the reference. Errors never touch the text.
 */
export function useImageUploads({ spaceId, path, limits, target, onAttachment, onAppend }: Options) {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [rejections, setRejections] = useState<Rejection[]>([]);
  const [queue, setQueue] = useState<Completed[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const queued = useRef(0);

  const reject = useCallback((name: string, reason: string) => {
    setRejections((r) => [...r, { key: `r${++counter}`, name, reason }]);
    setAnnouncement(`${name} was not added: ${reason}.`);
  }, []);

  const onFiles = useCallback(
    (files: File[], pos?: number) => {
      const editor = target.current;
      let insertAt = pos ?? editor?.cursor() ?? 0;
      for (const file of files) {
        const name = file.name || 'image.png';
        const problem = checkFile(file, limits);
        if (problem) {
          reject(name, problem);
          continue;
        }

        const key = `u${++counter}`;
        if (editor) insertAt = editor.insertPlaceholder(insertAt, key, name);
        setUploads((u) => [...u, { key, name, progress: 0 }]);
        setAnnouncement(`Uploading ${name}`);
        uploadImage(spaceId, path, file, (progress) => setUploads((u) => u.map((row) => (row.key === key ? { ...row, progress } : row))))
          .then((upload) => {
            const attachment: DraftAttachment = {
              id: upload.id,
              repositoryPath: upload.repositoryPath,
              link: upload.link,
              name,
              previewUrl: upload.previewUrl,
            };
            onAttachment(attachment);
            setAnnouncement(`${name} uploaded`);
            queued.current++;
            setQueue((q) => [...q, { key, attachment }]);
          })
          .catch((error: unknown) => {
            target.current?.removePlaceholder(key);
            reject(name, uploadErrorText(error).replace(/\.$/, ''));
          })
          .finally(() => setUploads((u) => u.filter((row) => row.key !== key)));
      }
    },
    [target, limits, spaceId, path, onAttachment, reject],
  );

  /** The description of the first queued image was chosen: insert its reference. */
  const describe = useCallback(
    (alt: string) => {
      const [first] = queue;
      if (!first) return;
      const placed = target.current?.replacePlaceholder(first.key, alt, first.attachment.link) ?? false;
      if (!placed) onAppend(imageMarkdown(alt, first.attachment.link));
      setQueue((q) => q.slice(1));
      if (queue.length === 1) queued.current = 0;
    },
    [queue, target, onAppend],
  );

  const current = queue[0];
  const done = queued.current - queue.length + 1;
  return {
    onFiles,
    uploads,
    rejections,
    dismissRejection: (key: string) => setRejections((r) => r.filter((x) => x.key !== key)),
    describing: current ? { key: current.key, name: current.attachment.name, previewUrl: current.attachment.previewUrl } : undefined,
    describePosition: current ? ([done, queued.current] as [number, number]) : undefined,
    describe,
    announcement,
  };
}
