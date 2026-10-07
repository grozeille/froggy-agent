// Minimal Markdown renderer for the Ask AI panel (GFM-lite).
// Supports: headings, bold/italic/strikethrough, inline code, fenced code,
// links (http/https only), lists, task items, blockquotes, tables, hr.
// Raw HTML from the source is always escaped, never passed through.
// Single `_` emphasis is intentionally unsupported so snake_case survives.
// Dependency-free and DOM-free so it also runs under Node for unit tests.

function renderMarkdown(src) {
  return renderBlocks(String(src).split('\n'));
}

function renderBlocks(lines) {
  var html = '';
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Fenced code (an unclosed fence runs to the end: important while streaming).
    var fence = line.match(/^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/);
    if (fence) {
      var closeRe = fence[1].charAt(0) === '`' ? /^\s{0,3}`{3,}\s*$/ : /^\s{0,3}~{3,}\s*$/;
      var code = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        i++;
      }
      // Chart blocks render as inline SVG when charts.js is loaded and the
      // JSON is valid; partial JSON mid-stream falls back to a code block.
      if (/^(chart|froggy-chart)$/i.test(fence[2] || '')) {
        var chart =
          typeof renderChartBlock === 'function' ? renderChartBlock(code.join('\n')) : null;
        if (chart !== null && chart !== undefined) {
          html += chart;
          continue;
        }
      }
      var cls = fence[2] ? ' class="language-' + fence[2] + '"' : '';
      html += '<pre><code' + cls + '>' + escapeHtml(code.join('\n')) + '</code></pre>';
      continue;
    }

    // ATX heading.
    var heading = line.match(/^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*$/);
    if (heading) {
      var headingText = (heading[2] || '').replace(/\s+#+\s*$/, '');
      html += '<h' + heading[1].length + '>' + renderInline(headingText) + '</h' + heading[1].length + '>';
      i++;
      continue;
    }

    // Thematic break.
    if (
      /^\s{0,3}(?:\*[ \t]*){3,}$/.test(line) ||
      /^\s{0,3}(?:-[ \t]*){3,}$/.test(line) ||
      /^\s{0,3}(?:_[ \t]*){3,}$/.test(line)
    ) {
      html += '<hr>';
      i++;
      continue;
    }

    // Blockquote.
    if (/^\s{0,3}>/.test(line)) {
      var quote = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i++;
      }
      html += '<blockquote>' + renderBlocks(quote) + '</blockquote>';
      continue;
    }

    // Lists (flat: nested markers render as top-level items).
    var ordered = line.match(/^\s{0,3}(\d+)[.)]\s+(.*)$/);
    var unordered = !ordered && line.match(/^\s{0,3}[-*+]\s+(.*)$/);
    if (ordered || unordered) {
      var tag = ordered ? 'ol' : 'ul';
      var start = ordered ? parseInt(ordered[1], 10) : 1;
      var itemRe = ordered ? /^\s{0,3}\d+[.)]\s+(.*)$/ : /^\s{0,3}[-*+]\s+(.*)$/;
      var items = [];
      while (i < lines.length) {
        var itemMatch = lines[i].match(itemRe);
        if (!itemMatch) {
          break;
        }
        items.push(itemMatch[1]);
        i++;
      }
      var startAttr = tag === 'ol' && start !== 1 ? ' start="' + start + '"' : '';
      html += '<' + tag + startAttr + '>' + items.map(renderListItem).join('') + '</' + tag + '>';
      continue;
    }

    // Tables: header row + delimiter row.
    if (
      line.indexOf('|') !== -1 &&
      i + 1 < lines.length &&
      isTableDelimiter(lines[i + 1])
    ) {
      var headers = splitRow(line);
      var aligns = splitRow(lines[i + 1]).map(parseAlign);
      i += 2;
      var rows = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && lines[i].indexOf('|') !== -1) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      html += renderTable(headers, aligns, rows);
      continue;
    }

    // Paragraph.
    var paragraph = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !startsBlock(lines[i], lines[i + 1])) {
      paragraph.push(lines[i]);
      i++;
    }
    html += '<p>' + renderInline(paragraph.join('\n')) + '</p>';
  }
  return html;
}

function renderListItem(src) {
  var task = src.match(/^\[([ xX])\]\s+(.*)$/);
  if (task) {
    var checked = task[1].toLowerCase() === 'x' ? ' checked' : '';
    return (
      '<li class="md-task"><input type="checkbox" disabled' +
      checked +
      '> ' +
      renderInline(task[2]) +
      '</li>'
    );
  }
  return '<li>' + renderInline(src) + '</li>';
}

function splitRow(line) {
  var cells = line.trim().split('|');
  var out = [];
  for (var k = 0; k < cells.length; k++) {
    out.push(cells[k].trim());
  }
  if (out.length > 0 && out[0] === '') {
    out.shift();
  }
  if (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out;
}

function isTableDelimiter(line) {
  var cells = splitRow(line);
  if (cells.length === 0) {
    return false;
  }
  for (var k = 0; k < cells.length; k++) {
    if (!/^:?-+:?$/.test(cells[k])) {
      return false;
    }
  }
  return true;
}

function parseAlign(cell) {
  var left = cell.charAt(0) === ':';
  var right = cell.charAt(cell.length - 1) === ':';
  if (left && right) {
    return 'c';
  }
  if (right) {
    return 'r';
  }
  return 'l';
}

function renderTable(headers, aligns, rows) {
  function cell(tag, text, align) {
    var cls = align === 'l' ? '' : ' class="md-' + align + '"';
    return '<' + tag + cls + '>' + renderInline(text) + '</' + tag + '>';
  }
  var headCells = [];
  for (var h = 0; h < headers.length; h++) {
    headCells.push(cell('th', headers[h], aligns[h] || 'l'));
  }
  var bodyRows = [];
  for (var r = 0; r < rows.length; r++) {
    var tds = [];
    for (var c = 0; c < headers.length; c++) {
      tds.push(cell('td', rows[r][c] || '', aligns[c] || 'l'));
    }
    bodyRows.push('<tr>' + tds.join('') + '</tr>');
  }
  return '<table><thead><tr>' + headCells.join('') + '</tr></thead><tbody>' + bodyRows.join('') + '</tbody></table>';
}

function startsBlock(line, next) {
  if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
    return true;
  }
  if (/^\s{0,3}#{1,6}(?:\s|$)/.test(line)) {
    return true;
  }
  if (
    /^\s{0,3}(?:\*[ \t]*){3,}$/.test(line) ||
    /^\s{0,3}(?:-[ \t]*){3,}$/.test(line) ||
    /^\s{0,3}(?:_[ \t]*){3,}$/.test(line)
  ) {
    return true;
  }
  if (/^\s{0,3}>/.test(line)) {
    return true;
  }
  if (/^\s{0,3}([-*+]\s+|\d+[.)]\s+)/.test(line)) {
    return true;
  }
  return (
    next !== undefined && line.indexOf('|') !== -1 && isTableDelimiter(next)
  );
}

function renderInline(text) {
  var out = '';
  var segments = splitSpecials(String(text));
  for (var k = 0; k < segments.length; k++) {
    out += segments[k].html !== undefined ? segments[k].html : renderInlineText(segments[k].text);
  }
  return out;
}

// Split out escapes and code spans so their content is never formatted.
function splitSpecials(text) {
  var segments = [];
  var re = /\\([\\`*_{}[\]()#+\-.!|~>])|(`+)([\s\S]+?)\2/g;
  var last = 0;
  var m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ text: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      segments.push({ html: escapeHtml(m[1]) });
    } else {
      segments.push({ html: '<code>' + escapeHtml(m[3]) + '</code>' });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last) });
  }
  return segments;
}

function renderInlineText(text) {
  var out = escapeHtml(text);
  var linkRe = /\[([^\]]+?)\]\(([^)\s]+?)(?:\s+"[^"]*?")?\)/g;
  var segments = [];
  var last = 0;
  var m;
  while ((m = linkRe.exec(out)) !== null) {
    if (m.index > last) {
      segments.push(renderEmphasis(out.slice(last, m.index)));
    }
    if (isHttpUrl(m[2])) {
      segments.push('<a href="' + m[2] + '">' + renderEmphasis(m[1]) + '</a>');
    } else {
      segments.push('[' + renderEmphasis(m[1]) + '](' + m[2] + ')');
    }
    last = m.index + m[0].length;
  }
  if (last < out.length) {
    segments.push(renderEmphasis(out.slice(last)));
  }
  return segments.join('').replace(/ {2,}\n/g, '<br>\n');
}

function renderEmphasis(text) {
  return text
    .replace(/(^|[^A-Za-z0-9])\*\*(.+?)\*\*(?![A-Za-z0-9])/g, '$1<strong>$2</strong>')
    .replace(/(^|[^A-Za-z0-9])\*(.+?)\*(?![A-Za-z0-9])/g, '$1<em>$2</em>')
    .replace(/(^|[^A-Za-z0-9])~~(.+?)~~(?![A-Za-z0-9])/g, '$1<del>$2</del>');
}

function isHttpUrl(href) {
  return /^https?:\/\//i.test(href);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
