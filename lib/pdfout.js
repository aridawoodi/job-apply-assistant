/* PDF output with the bundled jsPDF: a clean, text-based (ATS-friendly) resume laid out
 * from blocks, using the standard Helvetica font (works the same on Mac and Windows).
 * The layout follows the master's structure (name, contact lines, section headings,
 * job lines with right-aligned dates, bullets) but is an approximation of the original design. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};

  // jsPDF's standard fonts use WinAnsi: map common Unicode punctuation, drop what can't be shown.
  const MAP = { '\u2010': '-', '\u2011': '-', '\u2212': '-', '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '', '\u2192': '->', '\u2713': 'v', '\u2714': 'v' };
  const WINANSI = /[\x20-\x7e\u00a1-\u00ff\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026\u2030\u2039\u203a\u20ac\u2122\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\t]/;
  const clean = s => Array.from(String(s || '')).map(ch => (MAP[ch] !== undefined ? MAP[ch] : WINANSI.test(ch) ? ch : (ch === '\u00b7' ? '\u00b7' : '?'))).join('');

  function build(tailored, opts) {
    opts = opts || {};
    const { jsPDF } = g.jspdf;
    const W = opts.pageWidthPt || 612, H = opts.pageHeightPt || 792;
    const doc = new jsPDF({ unit: 'pt', format: [W, H], compress: true });
    doc.setProperties({ title: opts.title || 'Resume', author: opts.author || '', creator: 'Job Apply Assistant' });
    const M = opts.marginPt || 40;
    const body = Math.min(11, Math.max(9, opts.bodyPt || 10));
    const lh = f => f * 1.28;
    let y = M;
    const pageBreak = need => { if (y + need > H - M) { doc.addPage([W, H]); y = M; } };
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
    const writeWrapped = (text, x, width, size, style, indentFirst) => {
      font(style, size);
      const lines = doc.splitTextToSize(clean(text), width - (indentFirst || 0));
      lines.forEach((ln, i) => { pageBreak(lh(size)); doc.text(ln, x + (i === 0 ? (indentFirst || 0) : 0), y + size); y += lh(size); });
    };
    const blocks = tailored.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const t = clean(b.text);
      if (b.type === 'name') {
        const size = Math.min(24, Math.max(15, b.size || 18));
        font('bold', size); pageBreak(lh(size));
        if (b.align === 'center') doc.text(t, W / 2, y + size, { align: 'center' }); else doc.text(t, M, y + size);
        y += lh(size) + 2; continue;
      }
      if (b.type === 'contact') {
        font('normal', body - 0.5); pageBreak(lh(body));
        const lines = doc.splitTextToSize(t.replace(/\t/g, '   '), W - 2 * M);
        lines.forEach(ln => { if (b.align === 'center') doc.text(ln, W / 2, y + body, { align: 'center' }); else doc.text(ln, M, y + body); y += lh(body - 0.5); });
        continue;
      }
      if (b.type === 'heading') {
        y += 8; pageBreak(lh(body + 1.5) + 18);
        font('bold', body + 1.5); doc.text(t.toUpperCase(), M, y + body + 1.5);
        y += lh(body + 1.5); doc.setLineWidth(0.6); doc.setDrawColor(80); doc.line(M, y, W - M, y); y += 4; continue;
      }
      if (b.type === 'entry' || /\t/.test(t)) {
        const [left, right] = t.split('\t');
        const style = b.bold || b.type === 'entry' ? (i > 0 && blocks[i - 1].type === 'entry' && blocks[i - 1].group === b.group ? 'normal' : 'bold') : 'normal';
        if (style === 'bold') y += 3;
        pageBreak(lh(body) * 2);
        font(style, body);
        const rw = right ? doc.getTextWidth(right.trim()) + 8 : 0;
        const lines = doc.splitTextToSize(left.trim(), W - 2 * M - rw);
        lines.forEach((ln, k) => { pageBreak(lh(body)); doc.text(ln, M, y + body); if (k === 0 && right) { font('normal', body); doc.text(right.trim(), W - M, y + body, { align: 'right' }); font(style, body); } y += lh(body); });
        continue;
      }
      if (b.type === 'bullet') {
        font('normal', body); pageBreak(lh(body));
        doc.text('\u2022', M + 6, y + body);
        writeWrapped(t, M + 16, W - 2 * M - 16, body, 'normal');
        y += 1; continue;
      }
      writeWrapped(t, M, W - 2 * M, body, b.bold ? 'bold' : 'normal');
      y += 2;
    }
    return { arrayBuffer: doc.output('arraybuffer'), pages: doc.getNumberOfPages() };
  }

  JAA.pdfout = { build, clean };
})(typeof self !== 'undefined' ? self : this);
