/** Extract the display name of a skill from its SKILL.md content. */

export function extractSkillTitle(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    // First H1 only: "# Title" (exactly one leading #).
    if (/^#\s+\S/.test(line)) {
      return line.replace(/^#\s+/, '').trim();
    }
  }
  return fallback;
}
