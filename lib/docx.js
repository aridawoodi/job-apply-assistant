/* DOCX output.
 * editInPlace: changes the text of paragraphs in the user's own .docx (by paragraph index) and
 *   reorders bullet paragraphs, keeping every style, font, margin, header and numbering.
 * build: writes a clean, simple .docx from blocks (used when the master resume is a PDF). */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XMLNS = 'http://www.w3.org/2000/xmlns/';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function textRuns(p) {
    return Array.from(p.getElementsByTagNameNS(W, 'r')).filter(r => {
      let a = r.parentNode; while (a && a !== p) { if (a.localName === 'del' || a.localName === 'fldSimple') return false; a = a.parentNode; }
      return Array.from(r.childNodes).some(c => c.nodeType === 1 && /^(t|tab|br)$/.test(c.localName));
    });
  }
  // Put `text` into the paragraph: the first text run keeps its formatting and gets all the text;
  // the text of later runs is removed (runs holding drawings / fields are left alone).
  function setParagraphText(p, text) {
    const runs = textRuns(p);
    if (!runs.length) return false;
    const doc = p.ownerDocument;
    const first = runs[0];
    Array.from(first.childNodes).forEach(c => { if (c.nodeType === 1 && /^(t|tab|br)$/.test(c.localName)) first.removeChild(c); });
    const t = doc.createElementNS(W, 'w:t');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.textContent = text;
    first.appendChild(t);
    for (const r of runs.slice(1)) {
      const keep = Array.from(r.childNodes).some(c => c.nodeType === 1 && !/^(t|tab|br|rPr|lastRenderedPageBreak)$/.test(c.localName));
      if (keep) Array.from(r.childNodes).forEach(c => { if (c.nodeType === 1 && /^(t|tab|br)$/.test(c.localName)) r.removeChild(c); });
      else r.parentNode.removeChild(r);
    }
    // drop now-empty hyperlinks / smart tags
    Array.from(p.getElementsByTagNameNS(W, 'hyperlink')).forEach(h => { if (!h.textContent.trim() && !h.getElementsByTagNameNS(W, 'drawing').length) h.parentNode.removeChild(h); });
    return true;
  }

  async function editInPlace(arrayBuffer, master, tailored) {
    const zip = await g.JSZip.loadAsync(arrayBuffer);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read this Word file');
    const ps = Array.from(doc.getElementsByTagNameNS(W, 'p'));
    const report = { changed: 0, moved: 0, skipped: [] };
    const orig = new Map(master.blocks.map(b => [b.id, b]));
    // 1) text changes, by paragraph index (indexes are taken before any reordering)
    for (const b of tailored.blocks) {
      const o = orig.get(b.id);
      if (!o || o.pIndex === undefined || o.text === b.text) continue;
      const p = ps[o.pIndex];
      if (!p) { report.skipped.push(b.id); continue; }
      const curText = JAA.resume ? JAA.resume.paraText(p).replace(/\u00a0/g, ' ').trim() : '';
      const plain = curText.replace(JAA.resume ? JAA.resume.BULLET_RE : /^$/, '').replace(/[ ]{2,}/g, ' ').trim();
      const prefix = (curText.match(JAA.resume ? JAA.resume.BULLET_RE : /^$/) || [''])[0];
      if (JAA.resume && plain !== o.text) { report.skipped.push(b.id); continue; }
      if (setParagraphText(p, prefix + b.text)) report.changed++; else report.skipped.push(b.id);
    }
    // 2) bullet order inside a group: paragraphs must be consecutive siblings
    const groups = {};
    tailored.blocks.forEach(b => { if (b.type === 'bullet' && b.group) (groups[b.group] = groups[b.group] || []).push(b.id); });
    for (const [gid, ids] of Object.entries(groups)) {
      const origIds = master.blocks.filter(b => b.group === gid && b.type === 'bullet').map(b => b.id);
      if (ids.join() === origIds.join()) continue;
      const nodes = origIds.map(id => ps[orig.get(id).pIndex]);
      const parent = nodes[0].parentNode;
      const consecutive = nodes.every((n, i) => n.parentNode === parent && (i === 0 || nextElement(nodes[i - 1]) === n));
      if (!consecutive) { report.skipped.push(gid); continue; }
      const after = nextElement(nodes[nodes.length - 1]);
      nodes.forEach(n => parent.removeChild(n));
      ids.forEach(id => parent.insertBefore(ps[orig.get(id).pIndex], after));
      report.moved++;
    }
    let out = new XMLSerializer().serializeToString(doc);
    if (!/^<\?xml/.test(out)) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
    zip.file('word/document.xml', out);
    const ab = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: DOCX_MIME });
    return { arrayBuffer: ab, report };
  }
  function nextElement(n) { let x = n.nextSibling; while (x && x.nodeType !== 1) x = x.nextSibling; return x; }

  // Estimated page count for an edited DOCX: the master's page count (docProps/app.xml), scaled by text length.
  async function estimatePages(arrayBuffer, master, tailored) {
    try {
      const zip = await g.JSZip.loadAsync(arrayBuffer);
      const app = zip.file('docProps/app.xml') ? await zip.file('docProps/app.xml').async('string') : '';
      const m = app.match(/<Pages>(\d+)<\/Pages>/);
      if (!m) return 0;
      const len = bl => bl.reduce((n, b) => n + b.text.length + 40, 0);
      const ratio = len(tailored.blocks) / Math.max(1, len(master.blocks));
      const est = +m[1] * ratio;
      return Math.max(1, ratio <= 1.0 ? +m[1] : Math.ceil(est - 0.08));
    } catch (_) { return 0; }
  }

  /* ---------- clean DOCX from blocks ---------- */
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function run(text, rpr) {
    const parts = String(text).split('\t');
    return parts.map((t, i) => (i ? `<w:r>${rpr || ''}<w:tab/></w:r>` : '') + (t ? `<w:r>${rpr || ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>` : '')).join('');
  }
  function build(tailored, opts) {
    opts = opts || {};
    const pageW = opts.pageWidthPt || 612, pageH = opts.pageHeightPt || 792;
    const twW = Math.round(pageW * 20), twH = Math.round(pageH * 20), margin = 720; // 0.5"
    const rightTab = twW - 2 * margin;
    const body = tailored.blocks.map(b => {
      const tabs = /\t/.test(b.text) ? `<w:tabs><w:tab w:val="right" w:pos="${rightTab}"/></w:tabs>` : '';
      const jc = b.align === 'center' ? '<w:jc w:val="center"/>' : '';
      if (b.type === 'name') return `<w:p><w:pPr><w:pStyle w:val="JaaName"/>${jc}</w:pPr>${run(b.text)}</w:p>`;
      if (b.type === 'contact') return `<w:p><w:pPr><w:pStyle w:val="JaaContact"/>${jc}</w:pPr>${run(b.text)}</w:p>`;
      if (b.type === 'heading') return `<w:p><w:pPr><w:pStyle w:val="JaaHeading"/></w:pPr>${run(b.text.toUpperCase())}</w:p>`;
      if (b.type === 'bullet') return `<w:p><w:pPr><w:pStyle w:val="JaaBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>${tabs}</w:pPr>${run(b.text)}</w:p>`;
      if (b.type === 'entry') return `<w:p><w:pPr><w:pStyle w:val="JaaEntry"/>${tabs}</w:pPr>${run(b.text, b.bold ? '<w:rPr><w:b/></w:rPr>' : '')}</w:p>`;
      return `<w:p><w:pPr>${tabs}${jc}</w:pPr>${run(b.text, b.bold ? '<w:rPr><w:b/></w:rPr>' : '')}</w:p>`;
    }).join('');
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:pgSz w:w="${twW}" w:h="${twH}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const font = opts.font || 'Calibri';
    const sz = Math.round((opts.bodyPt || 10.5) * 2);
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="40" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="JaaName"><w:name w:val="Resume Name"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:sz w:val="${Math.round((opts.namePt || 18) * 2)}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="JaaContact"><w:name w:val="Resume Contact"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="20"/></w:pPr><w:rPr><w:sz w:val="${sz - 1}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="JaaHeading"><w:name w:val="Resume Heading"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="60"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="444444"/></w:pBdr></w:pPr><w:rPr><w:b/><w:sz w:val="${sz + 2}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="JaaEntry"><w:name w:val="Resume Entry"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="20"/></w:pPr><w:rPr><w:b/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="JaaBullet"><w:name w:val="Resume Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360" w:hanging="216"/><w:spacing w:after="20"/></w:pPr></w:style>
</w:styles>`;
    const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="${W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="216"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    const zip = new g.JSZip();
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
    zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opts.title || 'Resume')}</dc:title><dc:creator>${esc(opts.author || '')}</dc:creator></cp:coreProperties>`);
    zip.file('word/document.xml', doc);
    zip.file('word/styles.xml', styles);
    zip.file('word/numbering.xml', numbering);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', mimeType: DOCX_MIME });
  }

  JAA.docx = { editInPlace, build, estimatePages, setParagraphText, DOCX_MIME };
})(typeof self !== 'undefined' ? self : this);
