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

/**
 * Extract the `description:` field from a SKILL.md YAML frontmatter block
 * (single-line values only). Used to route requests to the matching skill.
 */
export function extractSkillDescription(markdown: string, fallback: string): string {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return fallback;
  }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? '';
    if (line === '---' || line === '...') {
      break;
    }
    const match = /^description\s*:\s*(.+)$/.exec(line);
    if (match) {
      return stripQuotes(match[1].trim()) || fallback;
    }
  }
  return fallback;
}

function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).trim();
    }
  }
  return value;
}
