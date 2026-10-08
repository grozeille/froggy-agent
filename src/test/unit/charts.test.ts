import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface ChartDataset {
  label: string;
  data: number[];
}

interface ChartSpec {
  type: string;
  title: string;
  labels: string[];
  datasets: ChartDataset[];
  reference?: { value: number; label: string };
}

interface ChartSandbox {
  parseChartSpec: (text: string) => ChartSpec | null;
  renderChartBlock: (text: string) => string | null;
  renderMarkdown?: (src: string) => string;
}

// Chart specs are plain webview scripts: load the real shipped files in a VM.
function loadScripts(...names: string[]): ChartSandbox {
  const mediaDir = path.join(__dirname, '..', '..', '..', 'media');
  const sandbox: Record<string, unknown> = {};
  vm.createContext(sandbox);
  for (const name of names) {
    vm.runInContext(fs.readFileSync(path.join(mediaDir, name), 'utf8'), sandbox);
  }
  const api = sandbox as unknown as ChartSandbox;
  assert.strictEqual(typeof api.parseChartSpec, 'function');
  assert.strictEqual(typeof api.renderChartBlock, 'function');
  return api;
}

const charts = loadScripts('charts.js');
const withMarkdown = loadScripts('charts.js', 'markdown.js');

// Values cross the VM boundary: compare host-realm copies.
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}
interface ChartMeta {
  kind: string;
  labels: string[];
  datasets: ChartDataset[];
  lo?: number;
  span?: number;
  geom?: { w: number; h: number; padL: number; padT: number; plotW: number; plotH: number };
}

// data-chart attributes carry the hover contract: decode like the DOM does.
function chartMeta(html: string): ChartMeta {
  const match = html.match(/data-chart="([^"]*)"/);
  assert.ok(match, 'data-chart attribute present');
  const json = (match as RegExpMatchArray)[1]
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return JSON.parse(json) as ChartMeta;
}

suite('charts', () => {
  test('parses a full bar spec', () => {
    const spec = charts.parseChartSpec(
      '{"type":"bar","title":"RAM","labels":["a","b"],"datasets":[{"label":"MB","data":[10,20]}]}'
    );
    assert.ok(spec);
    assert.strictEqual(spec.type, 'bar');
    assert.strictEqual(spec.title, 'RAM');
    assert.deepStrictEqual(plain(spec.labels), ['a', 'b']);
    assert.strictEqual(spec.datasets.length, 1);
    assert.strictEqual(spec.datasets[0].label, 'MB');
    assert.deepStrictEqual(plain(spec.datasets[0].data), [10, 20]);
  });

  test('accepts shorthand values and defaults plain labels to bar', () => {
    const spec = charts.parseChartSpec('{"labels":["a","b"],"values":[1,2]}');
    assert.ok(spec);
    assert.strictEqual(spec.type, 'bar');
    assert.strictEqual(spec.datasets.length, 1);
    assert.deepStrictEqual(plain(spec.datasets[0].data), [1, 2]);
  });

  test('resolves auto to line for ascending dates or numbers', () => {
    const dates = charts.parseChartSpec(
      '{"labels":["2024-01","2024-02","2024-03"],"values":[1,3,2]}'
    );
    assert.ok(dates);
    assert.strictEqual(dates.type, 'line');
    const numbers = charts.parseChartSpec('{"labels":["1","2","3"],"values":[1,3,2]}');
    assert.ok(numbers);
    assert.strictEqual(numbers.type, 'line');
    const unordered = charts.parseChartSpec('{"labels":["b","a"],"values":[1,2]}');
    assert.ok(unordered);
    assert.strictEqual(unordered.type, 'bar');
  });

  test('keeps an explicit pie type', () => {
    const spec = charts.parseChartSpec('{"type":"pie","labels":["a","b"],"values":[1,2]}');
    assert.ok(spec);
    assert.strictEqual(spec.type, 'pie');
  });
  test('keeps an explicit area type', () => {
    const spec = charts.parseChartSpec('{"type":"area","labels":["a","b"],"values":[1,2]}');
    assert.ok(spec);
    assert.strictEqual(spec.type, 'area');
  });

  test('pairs labels and values by index and caps the size', () => {
    const labels = Array.from({ length: 30 }, (_, i) => `l${i}`);
    const values = Array.from({ length: 40 }, (_, i) => i + 1);
    const spec = charts.parseChartSpec(JSON.stringify({ labels, values }));
    assert.ok(spec);
    assert.strictEqual(spec.labels.length, 24);
    assert.strictEqual(spec.datasets[0].data.length, 24);
  });

  test('coerces numeric strings and drops non-numeric values', () => {
    const spec = charts.parseChartSpec(
      '{"labels":["a","b","c"],"values":["10","oops",20]}'
    );
    assert.ok(spec);
    assert.deepStrictEqual(plain(spec.datasets[0].data), [10, 20]);
  });

  test('rejects invalid specs so the caller falls back to a code block', () => {
    assert.strictEqual(charts.parseChartSpec('not json'), null);
    assert.strictEqual(charts.parseChartSpec(''), null);
    assert.strictEqual(charts.parseChartSpec('[]'), null);
    assert.strictEqual(charts.parseChartSpec('{}'), null);
    assert.strictEqual(charts.parseChartSpec('{"labels":["a"]}'), null);
    assert.strictEqual(charts.parseChartSpec('{"labels":["a"],"values":["oops"]}'), null);
    assert.strictEqual(charts.parseChartSpec('{"labels":[],"values":[]}'), null);
  });

  test('renders a bar chart with title and accessible label', () => {
    const html = charts.renderChartBlock(
      '{"type":"bar","title":"RAM","labels":["a","b"],"datasets":[{"label":"MB","data":[10,20]}]}'
    );
    assert.ok(html);
    assert.ok(html.includes('<figure class="md-chart"'));
    assert.ok(html.includes('<svg'));
    assert.ok(html.includes('<rect'));
    assert.ok(html.includes('<div class="md-chart-title">RAM</div>'));
    assert.ok(html.includes('<rect class="md-chart-c0"'), 'class-based fill (CSP-safe)');
    assert.ok(html.includes('>20</text>'), 'round top tick');
    assert.ok(!html.includes('>-'), 'no negative ticks on positive bars');
    assert.ok(html.includes('role="img"'));
    assert.ok(html.includes('aria-label="RAM'));
  });

  test('renders a line chart with a single dot on the latest point', () => {
    const html = charts.renderChartBlock(
      '{"type":"line","labels":["2024-01","2024-02"],"values":[1,2]}'
    );
    assert.ok(html);
    assert.ok(html.includes('<polyline'));
    assert.strictEqual(count(html, '<circle class="md-chart-c'), 1, 'one visible dot');
    assert.strictEqual(count(html, '<circle class="md-chart-hit"'), 2, 'invisible hover targets');
  });

  test('renders an area chart with a fading gradient fill', () => {
    const html = charts.renderChartBlock(
      '{"type":"area","labels":["2024-01","2024-02"],"values":[1,2]}'
    );
    assert.ok(html);
    assert.ok(html.includes('<linearGradient'), 'gradient defs');
    assert.ok(html.includes('fill="url(#md-chart-g'), 'fade fill');
    assert.ok(html.includes('stop-opacity="0.35"'), 'opaque top stop');
    assert.ok(html.includes('stop-opacity="0"'), 'transparent bottom stop');
    assert.ok(html.includes('<polyline'), 'line on top of the fill');
    assert.ok(html.includes('area chart'), 'accessible type name');
  });

  test('renders a pie chart with a percentage legend', () => {
    const html = charts.renderChartBlock(
      '{"type":"pie","title":"Share","labels":["a","b"],"values":[1,3]}'
    );
    assert.ok(html);
    assert.ok(html.includes('<path'));
    assert.ok(html.includes('md-chart-legend'));
    assert.ok(html.includes('25%'));
    assert.ok(html.includes('75%'));
    assert.ok(html.includes('<path class="md-chart-c'), 'class-based fill (CSP-safe)');
  });

  test('pie without a positive whole falls back to bars', () => {
    const html = charts.renderChartBlock('{"type":"pie","labels":["a","b"],"values":[0,0]}');
    assert.ok(html);
    assert.ok(html.includes('<rect'), 'zero shares render as bars');
  });

  test('shows a legend for multi-series charts', () => {
    const html = charts.renderChartBlock(
      '{"labels":["a"],"datasets":[{"label":"one","data":[1]},{"label":"two","data":[2]}]}'
    );
    assert.ok(html);
    assert.ok(html.includes('md-chart-legend'));
    assert.ok(html.includes('one'));
    assert.ok(html.includes('two'));
    assert.ok(html.includes('md-chart-swatch md-chart-b0'), 'class-based swatch');
  });

  test('escapes HTML in titles and labels', () => {
    const html = charts.renderChartBlock(
      '{"title":"<script>alert(1)</script>","labels":["<img src=x onerror=alert(1)>"],"values":[1]}'
    );
    assert.ok(html);
    assert.ok(!html.includes('<script>'), 'no raw script tag');
    assert.ok(!html.includes('<img'), 'no raw img tag');
    assert.ok(html.includes('&lt;script&gt;'), 'title escaped');
    assert.ok(html.includes('&lt;img'), 'label escaped');
  });

  test('emits no inline styles in any chart type', () => {
    const bodies = [
      '{"type":"bar","labels":["a","b"],"datasets":[{"label":"s","data":[1,2]}]}',
      '{"type":"line","labels":["a","b"],"values":[1,2]}',
      '{"type":"area","labels":["a","b"],"values":[1,2]}',
      '{"type":"pie","labels":["a","b"],"values":[1,2]}'
    ];
    for (const body of bodies) {
      const html = charts.renderChartBlock(body);
      assert.ok(html);
      assert.ok(!html.includes('style='), 'CSP blocks style attributes');
    }
  });

  test('zooms line axes to the data range with grouped ticks', () => {
    const html = charts.renderChartBlock(
      '{"type":"line","labels":["Jan","Feb","Mar","Apr","May"],"values":[14200,14500,14100,15000,15400]}'
    );
    assert.ok(html);
    assert.ok(html.includes('>14,000</text>'), 'grouped thousand tick');
    assert.ok(html.includes('>16,000</text>'), 'round top tick');
    assert.ok(!html.includes('>0</text>'), 'no zero baseline on lines');
  });

  test('thins x labels on long series', () => {
    const labels = Array.from({ length: 10 }, (_, i) => `2024-${String(i + 1).padStart(2, '0')}`);
    const values = Array.from({ length: 10 }, (_, i) => i + 1);
    const html = charts.renderChartBlock(JSON.stringify({ type: 'line', labels, values }));
    assert.ok(html);
    assert.strictEqual(count(html, '<text class="md-chart-tick"'), 10, '4 y ticks + 6 x labels');
    assert.ok(html.includes('>2024-10<'), 'last label kept');
    assert.ok(!html.includes('>2024-02<'), 'inner label thinned out');
  });

  test('renders an optional dashed reference line', () => {
    const html = charts.renderChartBlock(
      '{"type":"area","labels":["a","b","c"],"values":[10,20,15],"reference":{"value":18,"label":"Target"}}'
    );
    assert.ok(html);
    assert.ok(html.includes('md-chart-ref'), 'dashed line');
    assert.ok(html.includes('Target 18'), 'labeled value');
    assert.ok(html.includes('md-chart-ref-bg'), 'label backdrop');
    const out = charts.renderChartBlock(
      '{"type":"area","labels":["a","b","c"],"values":[10,20,15],"reference":100}'
    );
    assert.ok(out);
    assert.ok(!out.includes('md-chart-ref'), 'out-of-range reference skipped');
  });

  test('parses reference shorthand and ignores invalid references', () => {
    const spec = charts.parseChartSpec('{"labels":["a"],"values":[1],"reference":15}');
    assert.ok(spec);
    assert.deepStrictEqual(plain(spec).reference, { value: 15, label: '' });
    const bad = charts.parseChartSpec('{"labels":["a"],"values":[1],"reference":"soon"}');
    assert.ok(bad);
    assert.strictEqual(plain(bad).reference, undefined);
  });

  test('uses unique gradient ids across charts', () => {
    const body = '{"type":"area","labels":["a","b"],"values":[1,2]}';
    const a = charts.renderChartBlock(body) as string;
    const b = charts.renderChartBlock(body) as string;
    const idA = (a.match(/md-chart-g\d+/) || [])[0];
    const idB = (b.match(/md-chart-g\d+/) || [])[0];
    assert.ok(idA && idB && idA !== idB, 'unique gradient ids per chart');
  });

  test('exposes decoded hover metadata on cartesian charts', () => {
    const html = charts.renderChartBlock(
      '{"type":"line","labels":["a","b"],"datasets":[{"label":"s","data":[10,20]}]}'
    );
    assert.ok(html);
    assert.ok(html.includes('data-kind="line"'), 'kind attribute');
    const meta = chartMeta(html);
    assert.strictEqual(meta.kind, 'line');
    assert.deepStrictEqual(meta.labels, ['a', 'b']);
    assert.deepStrictEqual(meta.datasets[0].data, [10, 20]);
    assert.ok(meta.geom, 'axis geometry present');
    assert.strictEqual(meta.geom && meta.geom.padL, 54);
    assert.ok((meta.span || 0) > 0, 'positive y span');
  });

  test('marks bars and pie slices with hover indexes', () => {
    const bars = charts.renderChartBlock(
      '{"type":"bar","labels":["a","b"],"datasets":[{"label":"s","data":[1,2]}]}'
    );
    assert.ok(bars);
    assert.ok(bars.includes('data-kind="bar"'), 'bar kind');
    assert.ok(bars.includes('data-bar="1" data-set="0"'), 'bar indexes');
    const pie = charts.renderChartBlock('{"type":"pie","labels":["a","b","c"],"values":[1,2,3]}');
    assert.ok(pie);
    assert.ok(pie.includes('data-kind="pie"'), 'pie kind');
    assert.ok(pie.includes('data-slice="2"'), 'slice index');
    const line = charts.renderChartBlock('{"type":"line","labels":["a","b"],"values":[1,2]}');
    assert.ok(line);
    assert.ok(!line.includes('data-bar'), 'lines map cursor x instead');
    assert.ok(!line.includes('data-slice'), 'lines map cursor x instead');
  });

  test('round-trips hostile labels through data-chart', () => {
    const labels = ['a"b', '<img src=x onerror=alert(1)>'];
    const html = charts.renderChartBlock(JSON.stringify({ labels, values: [1, 2] }));
    assert.ok(html);
    assert.ok(!html.includes('<img'), 'no raw tag in markup');
    assert.deepStrictEqual(chartMeta(html).labels, labels, 'exact labels after decode');
  });

  test('returns null for invalid blocks', () => {
    assert.strictEqual(charts.renderChartBlock('{"labels":["a"]}'), null);
    assert.strictEqual(charts.renderChartBlock('half-written {'), null);
  });

  test('markdown chart fences render as SVG when charts.js is loaded', () => {
    assert.strictEqual(typeof withMarkdown.renderMarkdown, 'function');
    const render = withMarkdown.renderMarkdown as (src: string) => string;
    const html = render('Top RAM:\n```chart\n{"labels":["a","b"],"values":[10,20]}\n```');
    assert.ok(html.includes('<p>Top RAM:</p>'));
    assert.ok(html.includes('<figure class="md-chart"'), 'chart block becomes a figure');
    assert.ok(html.includes('<svg'), 'chart block renders SVG');
  });

  test('markdown chart fences fall back to code when the JSON is invalid', () => {
    const render = withMarkdown.renderMarkdown as (src: string) => string;
    assert.ok(
      render('```chart\n{"labels":[\n```').includes('<pre><code'),
      'partial JSON mid-stream stays a code block'
    );
    assert.ok(
      render('```chart\n{"labels":["a"]}\n```').includes('<pre><code'),
      'dataless spec stays a code block'
    );
  });

  test('markdown chart fences fall back to code without charts.js', () => {
    const mediaDir = path.join(__dirname, '..', '..', '..', 'media');
    const sandbox: Record<string, unknown> = {};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(mediaDir, 'markdown.js'), 'utf8'), sandbox);
    const render = sandbox['renderMarkdown'] as (src: string) => string;
    const html = render('```chart\n{"labels":["a"],"values":[1]}\n```');
    assert.ok(html.includes('<pre><code'), 'no renderer means a code block');
    assert.ok(!html.includes('<svg'), 'no chart without the renderer');
  });
});
