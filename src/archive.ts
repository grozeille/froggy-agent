/**
 * Shared Archive node bits for the Skills and Sessions views: deleting an
 * item moves it to the view's Archive node (reversible), restoring moves
 * it back, and deleting from the archive removes it for good.
 */

/** Label of the archive node in the Skills and Sessions views. */
export const ARCHIVE_LABEL = 'Archive';

/**
 * Tree item context value of the archive nodes. Menus also match on the
 * view id, so both views share it.
 */
export const ARCHIVE_CONTEXT_VALUE = 'archive';

/** Archive node description: `empty`, `1 <singular>` or `N <plural>`. */
export function archiveSummary(count: number, singular: string, plural: string): string {
  if (count <= 0) {
    return 'empty';
  }
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}
