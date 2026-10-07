import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface TipRow {
  color: number;
  name: string;
  text: string;
}

interface InteractSandbox {
  chartNearestIndex: (x: number, n: number, padL: number, plotW: number) => number;
  chartTipHtml: (label: string, rows: TipRow[]) => string;
  chartFmtVal: (value: number) => string;
  chartFmtPct: (value: number) => string;
}

// The hover script is a plain webview script: load the real shipped file in
// a VM. A stub document proves the delegated listeners attach without a
// crash; the pure helpers below are what the tests exercise.
function loadInteract(documentStub: unknown): InteractSandbox {
  const file = path.join(__dirname, '..', '..', '..', 'media', 'chartInteract.js');
  const sandbox: Record<string, unknown> = { document: documentStub };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
  const api = sandbox as unknown as InteractSandbox;
  assert.strictEqual(typeof api.chartNearestIndex, 'function');
  assert.strictEqual(typeof api.chartTipHtml, 'function');
  return api;
}

const interact = loadInteract({ getElementById: () => null });

suite('chartInteract', () => {
  test('loads without a document or conversation', () => {
    const bare: Record<string, unknown> = {};
    vm.createContext(bare);
    const file = path.join(__dirname, '..', '..', '..', 'media', 'chartInteract.js');
    vm.runInContext(fs.readFileSync(file, 'utf8'), bare);
    assert.strictEqual(typeof bare['chartNearestIndex'], 'function');
  });

  test('maps cursor x to the nearest point', () => {
    // 10 points over plotW 572 from padL 54: slot 57.2.
    assert.strictEqual(interact.chartNearestIndex(82.6, 10, 54, 572), 0);
    assert.strictEqual(interact.chartNearestIndex(111.2, 10, 54, 572), 1);
    assert.strictEqual(interact.chartNearestIndex(597.4, 10, 54, 572), 9);
  });

  test('clamps cursor x outside the plot', () => {
    assert.strictEqual(interact.chartNearestIndex(0, 10, 54, 572), 0);
    assert.strictEqual(interact.chartNearestIndex(9999, 10, 54, 572), 9);
  });

  test('builds tooltip rows with series colors', () => {
    const html = interact.chartTipHtml('Jan', [
      { color: 0, name: 'before', text: '120' },
      { color: 7, name: 'after', text: '60' }
    ]);
    assert.ok(html.includes('<div class="md-chart-tip-label">Jan</div>'));
    assert.ok(html.includes('md-chart-swatch md-chart-b0'));
    assert.ok(html.includes('md-chart-swatch md-chart-b1'), 'color index wraps');
    assert.ok(html.includes('<span>before</span>'));
    assert.ok(html.includes('<span class="md-chart-tip-val">60</span>'));
  });

  test('omits empty series names and escapes tooltip text', () => {
    const html = interact.chartTipHtml('<b>&"x"', [{ color: 0, name: '', text: '<1>' }]);
    assert.ok(html.includes('&lt;b&gt;&amp;&quot;x&quot;'), 'label escaped');
    assert.ok(html.includes('&lt;1&gt;'), 'value escaped');
    assert.ok(!html.includes('<span></span>'), 'no empty name span');
    assert.ok(!html.includes('<b>'), 'no raw tag');
  });

  test('formats values and percents compactly', () => {
    assert.strictEqual(interact.chartFmtVal(10), '10');
    assert.strictEqual(interact.chartFmtVal(10.567), '10.57');
    assert.strictEqual(interact.chartFmtPct(25), '25%');
    assert.strictEqual(interact.chartFmtPct(33.36), '33.4%');
  });
});
