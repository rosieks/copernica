import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';

/** Tree operations (005 contracts/api.md §1–3). */

export type ItemKind = 'page' | 'folder';

export interface MoveRequest {
  base: string;
  kind: ItemKind;
  from: string;
  to: string;
  /** Pages only: new text of the first level-1 heading. */
  retitle?: string | null;
  message?: string;
}

export interface MovePreview {
  moves: { from: string; to: string }[];
  pageCount: number;
  fileCount: number;
  linkingPages: string[];
}

export interface MoveResult {
  commitId: string;
  path: string;
  moves: { from: string; to: string }[];
  updatedPages: string[];
}

export interface DeleteFolderRequest {
  base: string;
  folder: string;
  expectedPageCount?: number;
  message?: string;
}

export interface DeleteFolderPreview {
  pageCount: number;
  fileCount: number;
}

export interface DeleteFolderResult {
  commitId: string;
  pageCount: number;
}

export interface ReorderRequest {
  base: string;
  folder: string;
  item: string;
  /** Child name the item goes before; null = end. */
  before: string | null;
  message?: string | null;
}

function treeApi(spaceId: string, operation: 'move' | 'delete' | 'reorder'): string {
  return `/api/spaces/${encodeURIComponent(spaceId)}/tree/${operation}`;
}

export function previewMove(spaceId: string, request: Omit<MoveRequest, 'message'>, signal?: AbortSignal): Promise<MovePreview> {
  return api<MovePreview>(treeApi(spaceId, 'move'), { method: 'POST', json: { ...request, dryRun: true }, signal });
}

export function move(spaceId: string, request: MoveRequest): Promise<MoveResult> {
  return api<MoveResult>(treeApi(spaceId, 'move'), { method: 'POST', json: request });
}

export function previewDeleteFolder(spaceId: string, request: Pick<DeleteFolderRequest, 'base' | 'folder'>): Promise<DeleteFolderPreview> {
  return api<DeleteFolderPreview>(treeApi(spaceId, 'delete'), { method: 'POST', json: { ...request, dryRun: true } });
}

export function deleteFolder(spaceId: string, request: DeleteFolderRequest): Promise<DeleteFolderResult> {
  return api<DeleteFolderResult>(treeApi(spaceId, 'delete'), { method: 'POST', json: request });
}

export function reorder(spaceId: string, request: ReorderRequest): Promise<{ commitId: string }> {
  return api<{ commitId: string }>(treeApi(spaceId, 'reorder'), { method: 'POST', json: request });
}

/** Refreshes everything a tree operation can change: the tree, pages, history and discussions of the space. */
export async function invalidateAfterTreeChange(queryClient: QueryClient, spaceId: string): Promise<void> {
  await Promise.all(
    ['tree', 'page', 'page-source', 'history', 'discussions', 'pageInfo'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key, spaceId] }),
    ),
  );
}
