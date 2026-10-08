// Froggy Agent charts for the Ask AI panel.
// A ```chart (or ```froggy-chart) fenced block holding JSON renders as an
// inline SVG chart inside the assistant bubble:
// {"type":"bar|line|area|pie|auto","title":"...","labels":["a","b"],
//  "datasets":[{"label":"s1","data":[1,2]}]}
// Shorthand for a single unnamed series: {"labels":[...],"values":[...]}.
// Optional `"reference":{"value":15100,"label":"Clôt. préc."}` draws a
// dashed Google-Finance-style benchmark line across cartesian charts.
// `type` defaults to `auto` (line for ordered/time-like labels, else bar);
// pie and area are explicit-only. Invalid specs return null so the caller can fall
// back to a plain code block (important while streaming partial JSON).
// Colors come only from CSS classes (askAi.css): the panel Content Security
// Policy blocks inline `style` attributes, so no `style=` may be emitted.
// Dependency-free and DOM-free so it also runs under Node for unit tests.

var CHART_MAX_LABELS = 24;
var CHART_MAX_DATASETS = 6;
var CHART_MAX_TITLE = 120;
var CHART_MAX_LABEL = 40;
var CHART_MAX_TICK_LABEL = 14;

// Six series colors (md-chart-c/s/b/g + index), defined in askAi.css from
// the VS Code chart theme colors with hardcoded fallbacks.
var CHART_COLOR_COUNT = 6;

// Gradient ids must be unique when several charts share one bubble.
var chartUid = 0;

function parseChartSpec(text) {
  var raw;
  try {
    raw = JSON.parse(String(text));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  var datasets = [];
  if (Array.isArray(raw.datasets)) {
    for (var d = 0; d < raw.datasets.length && datasets.length < CHART_MAX_DATASETS; d++) {
      var item = raw.datasets[d];
      if (!item || typeof item !== 'object') {
        continue;
      }
      var data = toFiniteNumbers(item.data);
      if (data.length === 0) {
        continue;
      }
      datasets.push({
        label: typeof item.label === 'string' ? item.label.slice(0, CHART_MAX_LABEL) : '',
        data: data
      });
    }
  } else {
    // Shorthand single series: top-level `values` (or `data`).
    var shorthand = toFiniteNumbers(
      Array.isArray(raw.values) ? raw.values : Array.isArray(raw.data) ? raw.data : []
    );
    if (shorthand.length > 0) {
      datasets.push({ label: '', data: shorthand });
    }
  }
  if (datasets.length === 0) {
    return null;
  }

  var labelsExplicit = Array.isArray(raw.labels) && raw.labels.length > 0;
  var labels = labelsExplicit
    ? raw.labels.map(function (label) {
        return String(label).slice(0, CHART_MAX_LABEL);
      })
    : [];
  // Pair labels and values by index; extras on either side are dropped.
  var width = labelsExplicit ? labels.length : Infinity;
  for (var k = 0; k < datasets.length; k++) {
    width = Math.min(width, datasets[k].data.length);
  }
  if (!labelsExplicit) {
    labels = [];
    for (var g = 0; g < width; g++) {
      labels.push(String(g + 1));
    }
  }
  width = Math.min(width, labels.length, CHART_MAX_LABELS);
  if (width < 1) {
    return null;
  }
  labels = labels.slice(0, width);
  datasets = datasets.map(function (set) {
    return { label: set.label, data: set.data.slice(0, width) };
  });

  var type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : 'auto';
  if (type !== 'bar' && type !== 'line' && type !== 'area' && type !== 'pie') {
    type = labelsExplicit && isOrderedAxis(labels) ? 'line' : 'bar';
  }

  var reference;
  if (typeof raw.reference === 'number' && isFinite(raw.reference)) {
    reference = { value: raw.reference, label: '' };
  } else if (raw.reference && typeof raw.reference === 'object' && !Array.isArray(raw.reference)) {
    var refValue = Number(raw.reference.value);
    if (isFinite(refValue)) {
      reference = {
        value: refValue,
        label:
          typeof raw.reference.label === 'string'
            ? raw.reference.label.slice(0, CHART_MAX_LABEL)
            : ''
      };
    }
  }

  return {
    type: type,
    title: typeof raw.title === 'string' ? raw.title.trim().slice(0, CHART_MAX_TITLE) : '',
    labels: labels,
    datasets: datasets,
    reference: reference
  };
}

/** Full chart HTML for a fenced-block body, or null when it is not (yet) a valid spec. */
function renderChartBlock(text) {
  var spec = parseChartSpec(text);
  if (!spec) {
    return null;
  }
  var uid = ++chartUid;
  if (spec.type === 'pie') {
    return renderPie(spec);
  }
  return renderCartesian(spec, spec.type, uid);
}

function toFiniteNumbers(values) {
  var out = [];
  if (!Array.isArray(values)) {
    return out;
  }
  for (var i = 0; i < values.length; i++) {
    var num = typeof values[i] === 'number' ? values[i] : Number(values[i]);
    if (typeof num === 'number' && isFinite(num)) {
      out.push(num);
    }
  }
  return out;
}

/** Ordered axis: strictly ascending numbers or ISO dates -> a trend, best shown as a line. */
function isOrderedAxis(labels) {
  if (labels.length < 2) {
    return false;
  }
  var numeric = true;
  for (var i = 0; i < labels.length; i++) {
    if (!/^-?\d+(\.\d+)?$/.test(labels[i].trim())) {
      numeric = false;
      break;
    }
  }
  if (numeric) {
    return isAscending(
      labels.map(function (label) {
        return Number(label.trim());
      })
    );
  }
  var iso = true;
  for (var j = 0; j < labels.length; j++) {
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(labels[j].trim())) {
      iso = false;
      break;
    }
  }
  if (!iso) {
    return false;
  }
  return isAscending(
    labels.map(function (label) {
      return Date.parse(label.trim());
    })
  );
}

function isAscending(values) {
  for (var i = 1; i < values.length; i++) {
    if (!(values[i] > values[i - 1])) {
      return false;
    }
  }
  return true;
}

function renderCartesian(spec, kind, uid) {
  var W = 640;
  var H = 360;
  var padL = 54;
  var padR = 14;
  var padT = 14;
  var padB = 48;
  var plotW = W - padL - padR;
  var plotH = H - padT - padB;
  var n = spec.labels.length;
  var m = spec.datasets.length;

  var min = Infinity;
  var max = -Infinity;
  for (var s = 0; s < m; s++) {
    for (var v = 0; v < spec.datasets[s].data.length; v++) {
      var num = spec.datasets[s].data[v];
      if (num < min) {
        min = num;
      }
      if (num > max) {
        max = num;
      }
    }
  }
  // Bars stay zero-anchored (honest proportions); lines zoom to the data
  // range Google Finance style so trends stay visible.
  var scale =
    kind === 'bar'
      ? niceScale(Math.min(0, min), Math.max(0, max), false)
      : niceScale(min, max, true);
  var lo = scale.lo;
  var span = scale.hi - scale.lo;
  function y(value) {
    return padT + plotH - ((value - lo) / span) * plotH;
  }

  var svg = kind === 'area' ? areaDefs(uid || 0, m) : '';
  var tickCount = Math.round(span / scale.step);
  for (var t = 0; t <= tickCount; t++) {
    var tickValue = lo + scale.step * t;
    var ty = y(tickValue).toFixed(1);
    svg +=
      '<line class="md-chart-grid" x1="' +
      padL +
      '" y1="' +
      ty +
      '" x2="' +
      (padL + plotW) +
      '" y2="' +
      ty +
      '"/>';
    svg +=
      '<text class="md-chart-tick" x="' +
      (padL - 8) +
      '" y="' +
      ty +
      '" text-anchor="end" dominant-baseline="middle">' +
      escapeChartHtml(fmtTick(tickValue)) +
      '</text>';
  }

  if (
    spec.reference &&
    spec.reference.value >= lo &&
    spec.reference.value <= scale.hi
  ) {
    var refY = y(spec.reference.value);
    var refLabel =
      (spec.reference.label ? spec.reference.label + ' ' : '') +
      fmtTick(spec.reference.value);
    svg +=
      '<line class="md-chart-ref" x1="' +
      padL +
      '" y1="' +
      refY.toFixed(1) +
      '" x2="' +
      (padL + plotW) +
      '" y2="' +
      refY.toFixed(1) +
      '"/>';
    // Solid backdrop keeps the label legible where it meets the line.
    var refBoxW = refLabel.length * 7 + 12;
    var refTextY = refY - 7;
    svg +=
      '<rect class="md-chart-ref-bg" x="' +
      (padL + plotW - 4 - refBoxW).toFixed(1) +
      '" y="' +
      (refTextY - 11).toFixed(1) +
      '" width="' +
      refBoxW.toFixed(1) +
      '" height="15"/>';
    svg +=
      '<text class="md-chart-tick" x="' +
      (padL + plotW - 4) +
      '" y="' +
      refTextY.toFixed(1) +
      '" text-anchor="end">' +
      escapeChartHtml(refLabel) +
      '</text>';
  }

  var slotW = plotW / n;
  function cx(i) {
    return padL + slotW * (i + 0.5);
  }
  // Sparse x labels Google Finance style: first, last and evenly spaced.
  var shown = thinIndexes(n, kind === 'bar' ? 12 : 6);
  var rotated = shown.length > 8;
  for (var si = 0; si < shown.length; si++) {
    var i = shown[si];
    var label = truncateTick(spec.labels[i]);
    if (rotated) {
      svg +=
        '<text class="md-chart-tick" x="' +
        cx(i).toFixed(1) +
        '" y="' +
        (H - 8) +
        '" text-anchor="end" transform="rotate(-25 ' +
        cx(i).toFixed(1) +
        ' ' +
        (H - 8) +
        ')">' +
        escapeChartHtml(label) +
        '</text>';
    } else {
      svg +=
        '<text class="md-chart-tick" x="' +
        cx(i).toFixed(1) +
        '" y="' +
        (H - 10) +
        '" text-anchor="middle">' +
        escapeChartHtml(label) +
        '</text>';
    }
  }

  if (kind === 'area') {
    // Fills fade to the plot bottom (not to zero: the axis is zoomed).
    var fillBase = (padT + plotH).toFixed(1);
    for (var f = 0; f < m; f++) {
      var fill = [cx(0).toFixed(1) + ',' + fillBase];
      for (var w = 0; w < n; w++) {
        fill.push(cx(w).toFixed(1) + ',' + y(spec.datasets[f].data[w]).toFixed(1));
      }
      fill.push(cx(n - 1).toFixed(1) + ',' + fillBase);
      svg +=
        '<polygon fill="url(#md-chart-g' +
        (uid || 0) +
        '-' +
        f +
        ')" points="' +
        fill.join(' ') +
        '"/>';
    }
  }

  if (kind === 'line' || kind === 'area') {
    var dotR = n > 12 ? 3 : 4;
    for (var l = 0; l < m; l++) {
      var points = [];
      for (var p = 0; p < n; p++) {
        points.push(cx(p).toFixed(1) + ',' + y(spec.datasets[l].data[p]).toFixed(1));
      }
      svg +=
        '<polyline class="md-chart-line ' +
        colorClass('md-chart-s', l) +
        '" points="' +
        points.join(' ') +
        '"/>';
      // Invisible hover targets keep per-point tooltips without dots.
      for (var q = 0; q < n; q++) {
        svg +=
          '<circle class="md-chart-hit" cx="' +
          cx(q).toFixed(1) +
          '" cy="' +
          y(spec.datasets[l].data[q]).toFixed(1) +
          '" r="9"><title>' +
          escapeChartHtml(pointTip(spec, l, q)) +
          '</title></circle>';
      }
      // Only the latest point gets a visible dot, Google Finance style.
      svg +=
        '<circle class="' +
        colorClass('md-chart-c', l) +
        '" cx="' +
        cx(n - 1).toFixed(1) +
        '" cy="' +
        y(spec.datasets[l].data[n - 1]).toFixed(1) +
        '" r="' +
        dotR +
        '"><title>' +
        escapeChartHtml(pointTip(spec, l, n - 1)) +
        '</title></circle>';
    }
  } else {
    var barW;
    var clusterW;
    if (m === 1) {
      barW = Math.min(slotW * 0.55, 64);
      clusterW = barW;
    } else {
      clusterW = Math.min(slotW * 0.72, 44 * m);
      barW = Math.max(2, (clusterW - (m - 1) * 2) / m);
      clusterW = barW * m + 2 * (m - 1);
    }
    var zeroY = y(0);
    for (var b = 0; b < n; b++) {
      for (var c = 0; c < m; c++) {
        var value = spec.datasets[c].data[b];
        // Zero values still draw a 1px baseline tick (via the min height
        // below) so the category shows with its tooltip.
        var top = Math.min(zeroY, y(value));
        var height = Math.abs(y(value) - zeroY);
        var x = cx(b) - clusterW / 2 + c * (barW + 2);
        svg +=
          '<rect class="' +
          colorClass('md-chart-c', c) +
          '" data-bar="' +
          b +
          '" data-set="' +
          c +
          '" x="' +
          x.toFixed(1) +
          '" y="' +
          top.toFixed(1) +
          '" width="' +
          barW.toFixed(1) +
          '" height="' +
          Math.max(height, 1).toFixed(1) +
          '"><title>' +
          escapeChartHtml(pointTip(spec, c, b)) +
          '</title></rect>';
      }
    }
  }

  var legend = m > 1 ? renderLegend(spec.datasets) : '';
  // Machine-readable spec for hover (chartInteract.js): values plus the
  // axis geometry so the tooltip maps cursor pixels back to points.
  var meta = {
    kind: kind,
    labels: spec.labels,
    datasets: spec.datasets,
    lo: lo,
    span: span,
    geom: { w: W, h: H, padL: padL, padT: padT, plotW: plotW, plotH: plotH }
  };
  return wrapChart(spec, svg, W, H, legend, meta);
}

function renderPie(spec) {
  var data = spec.datasets[0].data;
  var total = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i] > 0) {
      total += data[i];
    }
  }
  // Shares need a positive whole: otherwise a bar chart says more.
  if (total <= 0 || data.length < 1) {
    return renderCartesian(spec, 'bar', 0);
  }
  var cx = 320;
  var cy = 180;
  var r = 140;
  var svg = '';
  var angle = -Math.PI / 2;
  for (var s = 0; s < data.length; s++) {
    var share = data[s] > 0 ? data[s] / total : 0;
    if (share <= 0) {
      continue;
    }
    var tip =
      spec.labels[s] + ': ' + fmtNum(data[s]) + ' (' + fmtPct(share * 100) + ')';
    if (share >= 0.9999) {
      svg +=
        '<circle class="' +
        colorClass('md-chart-c', s) +
        '" data-slice="' +
        s +
        '" cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="' +
        r +
        '"><title>' +
        escapeChartHtml(tip) +
        '</title></circle>';
      continue;
    }
    var next = angle + share * Math.PI * 2;
    var large = share > 0.5 ? 1 : 0;
    svg +=
      '<path class="' +
      colorClass('md-chart-c', s) +
      '" data-slice="' +
      s +
      '" d="M ' +
      cx +
      ' ' +
      cy +
      ' L ' +
      (cx + r * Math.cos(angle)).toFixed(1) +
      ' ' +
      (cy + r * Math.sin(angle)).toFixed(1) +
      ' A ' +
      r +
      ' ' +
      r +
      ' 0 ' +
      large +
      ' 1 ' +
      (cx + r * Math.cos(next)).toFixed(1) +
      ' ' +
      (cy + r * Math.sin(next)).toFixed(1) +
      ' Z"><title>' +
      escapeChartHtml(tip) +
      '</title></path>';
    angle = next;
  }
  var items = [];
  for (var k = 0; k < data.length; k++) {
    var pct = data[k] > 0 ? (data[k] / total) * 100 : 0;
    items.push({
      label: spec.labels[k] + ' — ' + fmtNum(data[k]) + ' (' + fmtPct(pct) + ')',
      color: k
    });
  }
  return wrapChart(spec, svg, 640, 360, renderLegendItems(items), {
    kind: 'pie',
    labels: spec.labels,
    datasets: [{ label: '', data: data }]
  });
}

function areaDefs(uid, count) {
  var defs = '<defs>';
  for (var f = 0; f < count; f++) {
    var id = 'md-chart-g' + uid + '-' + f;
    defs +=
      '<linearGradient id="' +
      id +
      '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" class="' +
      colorClass('md-chart-g', f) +
      '" stop-opacity="0.35"/>' +
      '<stop offset="1" class="' +
      colorClass('md-chart-g', f) +
      '" stop-opacity="0"/>' +
      '</linearGradient>';
  }
  return defs + '</defs>';
}

function renderLegend(datasets) {
  var items = [];
  for (var i = 0; i < datasets.length; i++) {
    items.push({ label: datasets[i].label || 'Series ' + (i + 1), color: i });
  }
  return renderLegendItems(items);
}

function renderLegendItems(items) {
  var html = '<div class="md-chart-legend">';
  for (var i = 0; i < items.length; i++) {
    html +=
      '<span class="md-chart-legend-item"><span class="md-chart-swatch ' +
      colorClass('md-chart-b', items[i].color) +
      '"></span>' +
      escapeChartHtml(items[i].label) +
      '</span>';
  }
  return html + '</div>';
}

function wrapChart(spec, svg, w, h, legend, meta) {
  var title = spec.title
    ? '<div class="md-chart-title">' + escapeChartHtml(spec.title) + '</div>'
    : '';
  return (
    '<figure class="md-chart" role="img" aria-label="' +
    escapeChartHtml(chartAriaLabel(spec)) +
    '" data-kind="' +
    meta.kind +
    '" data-chart="' +
    escapeChartHtml(JSON.stringify(meta)) +
    '">' +
    title +
    '<svg viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '" aria-hidden="true">' +
    svg +
    '</svg>' +
    legend +
    '</figure>'
  );
}

function chartAriaLabel(spec) {
  var parts = [];
  var set = spec.datasets[0];
  var count = Math.min(spec.labels.length, 6);
  for (var i = 0; i < count; i++) {
    parts.push(spec.labels[i] + ': ' + fmtNum(set.data[i]));
  }
  var summary = parts.join(', ');
  if (spec.labels.length > count) {
    summary += ', …';
  }
  return (spec.title ? spec.title + ' — ' : '') + spec.type + ' chart: ' + summary;
}

function pointTip(spec, datasetIndex, labelIndex) {
  var set = spec.datasets[datasetIndex];
  var prefix = spec.datasets.length > 1 && set.label ? set.label + ' — ' : '';
  return prefix + spec.labels[labelIndex] + ': ' + fmtNum(set.data[labelIndex]);
}

function colorClass(prefix, index) {
  return prefix + (index % CHART_COLOR_COUNT);
}

/** Round axis bounds with ~4 nice steps so ticks land on readable numbers. */
function niceScale(min, max, pad) {
  if (!(max > min)) {
    // Single distinct value: pad around it so the series stays visible.
    if (max === 0) {
      return { lo: 0, hi: 1, step: 0.25 };
    }
    var mag = Math.pow(10, Math.floor(Math.log10(Math.abs(max))));
    return { lo: max - mag, hi: max + mag, step: mag / 2 };
  }
  // Lines pad the range so endpoints breathe; bars fit the data exactly.
  var gap = pad === false ? 0 : (max - min) * 0.08;
  var step = niceCeil((max - min + gap * 2) / 4);
  return {
    lo: Math.floor((min - gap) / step) * step,
    hi: Math.ceil((max + gap) / step) * step,
    step: step
  };
}

/** First, last and evenly spaced indexes so x labels stay readable. */
function thinIndexes(n, max) {
  var out = [];
  if (n <= max) {
    for (var i = 0; i < n; i++) {
      out.push(i);
    }
    return out;
  }
  for (var k = 0; k < max; k++) {
    out.push(Math.round((k * (n - 1)) / (max - 1)));
  }
  return out;
}

function niceCeil(value) {
  if (!(value > 0)) {
    return 1;
  }
  var magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  var n = value / magnitude;
  var nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * magnitude;
}

function fmtNum(value) {
  return String(parseFloat(value.toFixed(2)));
}

function fmtTick(value) {
  var rounded = parseFloat(value.toFixed(2));
  if (rounded === 0) {
    return '0';
  }
  var abs = Math.abs(rounded);
  if (abs >= 1000000 && rounded % 1 === 0) {
    return String(parseFloat((rounded / 1000000).toFixed(2))) + 'M';
  }
  if (abs >= 10000 && rounded % 1 === 0) {
    return groupThousands(rounded);
  }
  return String(rounded);
}

function groupThousands(value) {
  var sign = value < 0 ? '-' : '';
  var digits = String(Math.abs(value));
  var out = '';
  while (digits.length > 3) {
    out = ',' + digits.slice(-3) + out;
    digits = digits.slice(0, -3);
  }
  return sign + digits + out;
}

function fmtPct(value) {
  return String(parseFloat(value.toFixed(1))) + '%';
}

function truncateTick(label) {
  if (label.length > CHART_MAX_TICK_LABEL) {
    return label.slice(0, CHART_MAX_TICK_LABEL - 1) + '…';
  }
  return label;
}

function escapeChartHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
