import { antiforgeryToken, ApiError, type Schemas } from '../api/client';

export type PendingUpload = Schemas['PendingUpload'];

export interface UploadLimits {
  maxBytes: number;
  formats: readonly string[];
}

export const DEFAULT_LIMITS: UploadLimits = {
  maxBytes: 10 * 1024 * 1024,
  formats: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
};

const EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

/**
 * Early check with the same rules and messages as the server (FR-003). The server stays
 * authoritative: it also checks the file content, not only its type and name.
 */
export function checkFile(file: File, limits: UploadLimits = DEFAULT_LIMITS): string | undefined {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = file.type || EXTENSIONS[extension] || '';
  if (!limits.formats.includes(type)) {
    return 'only PNG, JPEG, GIF, WebP and SVG images are accepted';
  }
  if (file.size > limits.maxBytes) {
    return `it is larger than ${formatMegabytes(limits.maxBytes)}`;
  }
  if (file.size === 0) {
    return 'the file is empty';
  }
  return undefined;
}

/** Uploads one image as a pending image; reports progress (fetch has no upload progress). */
export function uploadImage(
  spaceId: string,
  pagePath: string,
  file: File,
  onProgress: (fraction: number) => void,
): Promise<PendingUpload> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `/api/spaces/${encodeURIComponent(spaceId)}/uploads?page=${encodeURIComponent(pagePath)}`);
    request.setRequestHeader('Accept', 'application/json');
    const token = antiforgeryToken();
    if (token) request.setRequestHeader('X-XSRF-TOKEN', token);
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      let body: unknown;
      try {
        body = request.responseText ? JSON.parse(request.responseText) : undefined;
      } catch {
        body = undefined;
      }
      if (request.status === 201) {
        resolve(body as PendingUpload);
      } else {
        const problem = (body as Record<string, unknown> | undefined) ?? { title: `Upload failed (${request.status}).` };
        reject(new ApiError(request.status, problem as never));
      }
    };
    request.onerror = () => reject(new Error('The image could not be uploaded. Check your connection and try again.'));
    const form = new FormData();
    form.append('file', file, file.name || 'image.png');
    request.send(form);
  });
}

/** Message for a failed upload: the server's detail when there is one. */
export function uploadErrorText(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title ?? error.message;
  return error instanceof Error ? error.message : 'The image could not be uploaded.';
}
