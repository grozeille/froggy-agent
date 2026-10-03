import * as assert from 'assert';
import { DATE_TIME_TOOL_NAME, describeDateTime } from '../../dateTime';

suite('dateTime', () => {
  test('describes a fixed date in UTC', () => {
    const text = describeDateTime(new Date('2026-10-02T19:00:00.000Z'), 'UTC');
    assert.ok(text.includes('Friday'));
    assert.ok(text.includes('2 October 2026'));
    assert.ok(text.includes('19:00:00'));
    assert.ok(text.includes('ISO 2026-10-02T19:00:00.000Z'));
  });

  test('defaults to the local time zone', () => {
    const text = describeDateTime(new Date('2026-10-02T19:00:00.000Z'));
    assert.ok(text.includes('ISO 2026-10-02T19:00:00.000Z'));
    assert.ok(text.length > 0);
  });

  test('tool name matches the package.json contribution', () => {
    assert.strictEqual(DATE_TIME_TOOL_NAME, 'pocDateTime');
  });
});
