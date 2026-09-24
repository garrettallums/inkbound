import type { Editor } from '../editor/editor';

/** Newly created editors are handed straight to the editor route (no reload). */
export const pendingEditors = new Map<string, Editor>();

export function navigate(hash: string) {
  if (location.hash !== hash) location.hash = hash;
}
