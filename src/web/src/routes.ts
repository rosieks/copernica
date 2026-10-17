import { encodePath } from './api/client';

export function spaceRoute(spaceId: string, path: string): string {
  return `/s/${encodeURIComponent(spaceId)}/${encodePath(path)}`;
}

export function pageApi(spaceId: string, path: string): string {
  return `/api/spaces/${encodeURIComponent(spaceId)}/pages/${encodePath(path)}`;
}

export function fileApi(spaceId: string, path: string, version?: string): string {
  const base = `/api/spaces/${encodeURIComponent(spaceId)}/files/${encodePath(path)}`;
  return version ? `${base}?version=${encodeURIComponent(version)}` : base;
}
