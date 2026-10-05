/**
 * Skill archive: deleting a skill moves its folder out of
 * `.github/skills` into the archive, restoring moves it back, and deleting
 * from the archive removes it for good.
 */

/**
 * Archive root, relative to the workspace root. Outside `.github` on purpose:
 * the skill runner and the preamble hint only read `.github/skills`, so
 * archived skills are invisible to the model by construction.
 */
export const ARCHIVE_DIR_NAME = '.froggy-agent/archive';

/** Tree item context values driving the Skills view menus. */
export const SKILL_CONTEXT_VALUE = 'skill';
export const ARCHIVED_SKILL_CONTEXT_VALUE = 'archivedSkill';
/**
 * Built-in skills (shipped by project setup): no archive/delete menu targets
 * this value, so they can neither be archived nor deleted from the view.
 */
export const BUILTIN_SKILL_CONTEXT_VALUE = 'builtinSkill';

/**
 * Name for the n-th archived copy of a skill slug: `ram-report` ->
 * `ram-report-2` -> `ram-report-3`. Attempt 0 keeps the name as-is.
 */
export function archiveCopyNameFor(skillName: string, attempt: number): string {
  if (attempt <= 0) {
    return skillName;
  }
  return `${skillName}-${attempt + 1}`;
}
