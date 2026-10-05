export const DATE_TIME_TOOL_NAME = 'froggyDateTime';

export function describeDateTime(date: Date, timeZone?: string): string {
  const format = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {})
  });
  return `${format.format(date)} (ISO ${date.toISOString()})`;
}
