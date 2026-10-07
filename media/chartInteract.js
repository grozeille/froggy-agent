// Froggy Agent chart hover: Google-Finance-style crosshair tooltips.
// One delegated listener on #conversation serves every chart bubble (the
// bubbles re-render on each streamed chunk, so per-figure listeners would
// not survive). Line/area charts get a vertical guide + focus dots at the
// nearest point; bars and pie slices show a tooltip for the hovered shape.
// Pure helpers (chartNearestIndex, chartTipHtml, ...) are DOM-free so they
// also run under Node for unit tests; only the IIFE below touches the DOM.

var CHART_TIP_COLORS = 6;

/** Nearest point index for a viewBox x on a cartesian plot. */
function chartNearestIndex(x, n, padL, plotW) {
  var slot = plotW / n;
  var idx = Math.round((x - padL) / slot - 0.5);
  if (idx <= 0) {
    return 0;
  }
  if (idx > n - 1) {
    return n - 1;
  }
  return idx;
}

/** Tooltip body: label plus one swatch row per series. */
function chartTipHtml(label, rows) {
  var html = '<div class="md-chart-tip-label">' + chartEsc(label) + '</div>';
  for (var i = 0; i < rows.length; i++) {
    html +=
      '<div class="md-chart-tip-row"><span class="md-chart-swatch md-chart-b' +
      (rows[i].color % CHART_TIP_COLORS) +
      '"></span>';
    if (rows[i].name) {
      html += '<span>' + chartEsc(rows[i].name) + '</span>';
    }
    html +=
      '<span class="md-chart-tip-val">' + chartEsc(rows[i].text) + '</span></div>';
  }
  return html;
}

function chartFmtVal(value) {
  return String(parseFloat(Number(value).toFixed(2)));
}

function chartFmtPct(value) {
  return String(parseFloat(Number(value).toFixed(1))) + '%';
}

function chartEsc(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

(function () {
  if (typeof document === 'undefined') {
    return;
  }
  var conversation = document.getElementById('conversation');
  if (!conversation || typeof conversation.addEventListener !== 'function') {
    return;
  }
  conversation.addEventListener('mousemove', onChartMouseMove);
  conversation.addEventListener('mouseout', onChartMouseOut);
  // A scrolled tooltip would detach from its point: hide it instead.
  if (typeof document.addEventListener === 'function') {
    document.addEventListener('scroll', hideVisibleTip, true);
  }

  function onChartMouseMove(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }
    var figure = target.closest('figure.md-chart');
    if (!figure) {
      return;
    }
    var spec = readSpec(figure);
    if (!spec) {
      return;
    }
    var svg = figure.querySelector('svg');
    if (!svg) {
      return;
    }
    if (spec.kind === 'pie') {
      var slice = target.closest('[data-slice]');
      if (!slice || !svg.contains(slice)) {
        hideFigure(figure);
        return;
      }
      showPieTip(figure, spec, Number(slice.getAttribute('data-slice')), event);
      return;
    }
    if (spec.kind === 'bar') {
      var bar = target.closest('rect[data-bar]');
      if (!bar || !svg.contains(bar)) {
        hideFigure(figure);
        return;
      }
      showBarTip(figure, spec, bar, event);
      return;
    }
    if (!target.closest('svg')) {
      hideFigure(figure);
      return;
    }
    var rect = svg.getBoundingClientRect();
    if (!rect.width) {
      return;
    }
    var x = (event.clientX - rect.left) * (spec.geom.w / rect.width);
    if (x < spec.geom.padL || x > spec.geom.padL + spec.geom.plotW) {
      hideFigure(figure);
      return;
    }
    showSeriesTip(
      figure,
      spec,
      chartNearestIndex(x, spec.labels.length, spec.geom.padL, spec.geom.plotW),
      event
    );
  }

  function onChartMouseOut(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') {
      return;
    }
    var figure = target.closest('figure.md-chart');
    if (!figure) {
      return;
    }
    if (event.relatedTarget && figure.contains(event.relatedTarget)) {
      return;
    }
    hideFigure(figure);
  }

  function hideVisibleTip() {
    var tip =
      typeof document.querySelector === 'function'
        ? document.querySelector('.md-chart-tip.show')
        : null;
    if (!tip) {
      return;
    }
    var figure = tip.closest('figure.md-chart');
    if (figure) {
      hideFigure(figure);
    } else {
      tip.classList.remove('show');
    }
  }

  function readSpec(figure) {
    if (figure._fgSpec !== undefined) {
      return figure._fgSpec;
    }
    var spec = null;
    try {
      var raw = JSON.parse(figure.getAttribute('data-chart') || 'null');
      if (
        raw &&
        typeof raw === 'object' &&
        typeof raw.kind === 'string' &&
        Array.isArray(raw.labels) &&
        Array.isArray(raw.datasets)
      ) {
        spec = raw;
      }
    } catch {
      spec = null;
    }
    figure._fgSpec = spec;
    return spec;
  }

  // Overlay is built lazily per figure: guide line, one focus dot per
  // series and the tooltip div. Positions use SVG attributes and tooltip
  // placement uses CSSOM, both allowed by the panel CSP (unlike `style=`
  // attributes in markup, which charts.js never emits).
  function ensureUi(figure, seriesCount) {
    if (figure._fgUi) {
      return figure._fgUi;
    }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = figure.querySelector('svg');
    var guide = document.createElementNS(NS, 'line');
    guide.setAttribute('class', 'md-chart-guide');
    guide.setAttribute('visibility', 'hidden');
    svg.appendChild(guide);
    var dots = [];
    for (var i = 0; i < seriesCount; i++) {
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'md-chart-c' + (i % CHART_TIP_COLORS) + ' md-chart-focus');
      dot.setAttribute('r', '4.5');
      dot.setAttribute('visibility', 'hidden');
      svg.appendChild(dot);
      dots.push(dot);
    }
    var tip = document.createElement('div');
    tip.className = 'md-chart-tip';
    figure.appendChild(tip);
    figure._fgUi = { guide: guide, dots: dots, tip: tip };
    return figure._fgUi;
  }

  function showSeriesTip(figure, spec, idx, event) {
    var ui = ensureUi(figure, spec.datasets.length);
    var g = spec.geom;
    var slot = g.plotW / spec.labels.length;
    var px = g.padL + slot * (idx + 0.5);
    ui.guide.setAttribute('x1', px.toFixed(1));
    ui.guide.setAttribute('x2', px.toFixed(1));
    ui.guide.setAttribute('y1', String(g.padT));
    ui.guide.setAttribute('y2', String(g.padT + g.plotH));
    ui.guide.setAttribute('visibility', 'visible');
    var rows = [];
    for (var l = 0; l < spec.datasets.length; l++) {
      var val = spec.datasets[l].data[idx];
      var cy = g.padT + g.plotH - ((val - spec.lo) / spec.span) * g.plotH;
      ui.dots[l].setAttribute('cx', px.toFixed(1));
      ui.dots[l].setAttribute('cy', cy.toFixed(1));
      ui.dots[l].setAttribute('visibility', 'visible');
      rows.push({
        color: l,
        name: spec.datasets[l].label || '',
        text: chartFmtVal(val)
      });
    }
    ui.tip.innerHTML = chartTipHtml(spec.labels[idx], rows);
    placeTip(figure, ui.tip, event);
  }

  function showBarTip(figure, spec, barEl, event) {
    var ui = ensureUi(figure, 0);
    var hot = figure.querySelector('.md-chart-bar-hot');
    if (hot && hot !== barEl) {
      hot.classList.remove('md-chart-bar-hot');
    }
    if (typeof barEl.classList !== 'undefined') {
      barEl.classList.add('md-chart-bar-hot');
    }
    var i = Number(barEl.getAttribute('data-bar'));
    var c = Number(barEl.getAttribute('data-set'));
    var set = spec.datasets[c] || { label: '', data: [] };
    ui.tip.innerHTML = chartTipHtml(spec.labels[i], [
      { color: c, name: set.label || '', text: chartFmtVal(set.data[i]) }
    ]);
    placeTip(figure, ui.tip, event);
  }

  function showPieTip(figure, spec, s, event) {
    var ui = ensureUi(figure, 0);
    var data = spec.datasets[0].data;
    var total = 0;
    for (var k = 0; k < data.length; k++) {
      if (data[k] > 0) {
        total += data[k];
      }
    }
    var pct =
      total > 0 && data[s] > 0 ? ' (' + chartFmtPct((data[s] / total) * 100) + ')' : '';
    ui.tip.innerHTML = chartTipHtml(spec.labels[s], [
      { color: s, name: '', text: chartFmtVal(data[s]) + pct }
    ]);
    placeTip(figure, ui.tip, event);
  }

  function placeTip(figure, tip, event) {
    tip.classList.add('show');
    var figRect = figure.getBoundingClientRect();
    var left = event.clientX - figRect.left + 14;
    if (left + tip.offsetWidth > figRect.width - 8) {
      left = event.clientX - figRect.left - tip.offsetWidth - 14;
    }
    if (left < 8) {
      left = 8;
    }
    var top = event.clientY - figRect.top - tip.offsetHeight - 12;
    if (top < 0) {
      top = event.clientY - figRect.top + 18;
    }
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
  }

  function hideFigure(figure) {
    var ui = figure._fgUi;
    if (!ui) {
      return;
    }
    ui.tip.classList.remove('show');
    ui.guide.setAttribute('visibility', 'hidden');
    for (var i = 0; i < ui.dots.length; i++) {
      ui.dots[i].setAttribute('visibility', 'hidden');
    }
    var hot = figure.querySelector('.md-chart-bar-hot');
    if (hot) {
      hot.classList.remove('md-chart-bar-hot');
    }
  }
})();
