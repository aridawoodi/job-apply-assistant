/* Resume parsing (runs in extension pages: onboarding, Options, tailor page).
 * PDF -> text lines via the bundled pdf.js; DOCX -> paragraphs via the bundled JSZip + DOMParser.
 * Both become a list of "blocks" (one per paragraph) with a type and a section, which the
 * profile extraction and the resume tailoring work on. Nothing leaves the computer. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};

  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const BULLET_RE = /^[\s]*([•●▪◦‣∙·\u2022\u25AA\u25CF\u2023\u2043\uF0B7\uF0A7]|[-–*](?=\s))\s*/;
  const SECTION_RES = [
    ['summary', /^(professional |career |executive )?(summary|profile|about( me)?|objective|overview)$/],
    ['experience', /^((work|professional|relevant|employment) )?(experience|employment( history)?|history|career)( history)?$|^work history$/],
    ['projects', /^((personal|selected|side|key) )?projects?$/],
    ['education', /^(education|academic background|education (and|&) (training|certifications?|credentials)|training)$/],
    ['skills', /^((technical|core|key) )?(skills|competencies|technologies|tools|expertise)( (and|&) (tools|technologies|interests))?$/],
    ['certifications', /^(certifications?|licen[cs]es( (and|&) certifications)?|certifications (and|&) licen[cs]es|courses)$/],
    ['languages', /^languages?$/],
    ['awards', /^(awards|honou?rs|achievements)( (and|&) (awards|honou?rs))?$/],
    ['volunteer', /^volunteer(ing| experience)?$/]
  ];
  const normH = s => String(s || '').toLowerCase().replace(/[^a-z& ]+/g, ' ').replace(/\s+/g, ' ').trim();
  function sectionOf(text) {
    const n = normH(text);
    for (const [k, re] of SECTION_RES) if (re.test(n)) return k;
    return null;
  }
  const looksHeading = (t, bold) => {
    const s = String(t || '').trim();
    if (!s || s.length > 48 || /[.:;]$/.test(s) || /\t/.test(s)) return false;
    if (sectionOf(s)) return true;
    const letters = s.replace(/[^A-Za-z]/g, '');
    return letters.length >= 4 && letters === letters.toUpperCase() && s.split(/\s+/).length <= 5 && !!bold;
  };

  /* ---------------- DOCX ---------------- */
  async function docxParagraphs(ab) {
    const zip = await g.JSZip.loadAsync(ab);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const ps = Array.from(doc.getElementsByTagNameNS(W, 'p'));
    return { zip, xml, doc, ps };
  }
  function paraText(p) {
    let out = '';
    const walk = n => {
      for (const c of Array.from(n.childNodes)) {
        if (c.nodeType !== 1) continue;
        const ln = c.localName;
        if (ln === 't') out += c.textContent;
        else if (ln === 'tab') out += '\t';
        else if (ln === 'br' || ln === 'cr') out += '\n';
        else if (ln === 'pPr' || ln === 'rPr' || ln === 'del' || ln === 'instrText') continue;
        else walk(c);
      }
    };
    walk(p);
    return out;
  }
  function paraInfo(p) {
    const pPr = p.getElementsByTagNameNS(W, 'pPr')[0];
    const style = pPr && pPr.getElementsByTagNameNS(W, 'pStyle')[0];
    const styleName = style ? style.getAttributeNS(W, 'val') || style.getAttribute('w:val') || '' : '';
    const numbered = !!(pPr && pPr.getElementsByTagNameNS(W, 'numPr').length) || /list ?(bullet|paragraph)/i.test(styleName);
    const runs = Array.from(p.getElementsByTagNameNS(W, 'r')).filter(r => r.getElementsByTagNameNS(W, 't').length);
    const bold = runs.length > 0 && runs.some(r => { const b = r.getElementsByTagNameNS(W, 'b')[0]; return b && !/^(0|false)$/.test(b.getAttributeNS(W, 'val') || b.getAttribute('w:val') || ''); });
    let size = 0;
    for (const r of runs) { const sz = r.getElementsByTagNameNS(W, 'sz')[0]; if (sz) size = Math.max(size, (+(sz.getAttributeNS(W, 'val') || sz.getAttribute('w:val')) || 0) / 2); }
    const jc = pPr && pPr.getElementsByTagNameNS(W, 'jc')[0];
    const align = jc ? (jc.getAttributeNS(W, 'val') || jc.getAttribute('w:val') || '') : '';
    return { styleName, numbered, bold, size, align: /center/.test(align) ? 'center' : /right|end/.test(align) ? 'right' : '', heading: /heading|title/i.test(styleName) };
  }
  async function parseDocx(ab) {
    const { ps } = await docxParagraphs(ab);
    const raw = ps.map((p, i) => {
      const t = paraText(p);
      const info = paraInfo(p);
      return { pIndex: i, text: t.replace(/\u00a0/g, ' '), bullet: info.numbered || BULLET_RE.test(t), bold: info.bold, size: info.size, heading: info.heading, align: info.align };
    });
    return finish('docx', raw.filter(b => b.text.trim()));
  }

  /* ---------------- PDF ---------------- */
  async function parsePdf(ab) {
    const lib = g.pdfjsLib;
    if (!lib) throw new Error('PDF reader not loaded');
    if (lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc && g.chrome && chrome.runtime && chrome.runtime.getURL) {
      lib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/vendor/pdf.worker.min.js');
    }
    const pdf = await lib.getDocument({ data: new Uint8Array(ab), isEvalSupported: false, disableFontFace: true, useSystemFonts: false }).promise;
    const lines = [];
    let pageWidth = 612, pageHeight = 792;
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      pageWidth = vp.width; pageHeight = vp.height;
      const tc = await page.getTextContent();
      const styles = tc.styles || {};
      const items = tc.items.filter(it => it.str !== undefined).map(it => ({
        s: it.str, x: it.transform[4], y: vp.height - it.transform[5], w: it.width, h: Math.abs(it.transform[3]) || it.height,
        bold: /bold|black|heavy|semibold/i.test(it.fontName + ' ' + ((styles[it.fontName] || {}).fontFamily || ''))
      }));
      // group into lines by baseline
      items.sort((a, b) => a.y - b.y || a.x - b.x);
      let cur = null;
      for (const it of items) {
        if (!it.s.trim() && !cur) continue;
        if (cur && Math.abs(it.y - cur.y) <= Math.max(2, cur.h * 0.45)) cur.items.push(it);
        else { cur = { y: it.y, h: it.h, items: [it], page: n }; lines.push(cur); }
      }
    }
    const out = [];
    for (const L of lines) {
      L.items.sort((a, b) => a.x - b.x);
      let text = '', lastEnd = null;
      const tabGap = Math.max(24, L.h * 2.2);
      for (const it of L.items) {
        if (!it.s.trim()) { // whitespace runs: Word exports a tab stop as one wide space
          if ((it.w || 0) > tabGap || (lastEnd != null && it.x - lastEnd > tabGap)) text += '\t'; else if (!/\s$/.test(text)) text += ' ';
          if (lastEnd != null) lastEnd = Math.max(lastEnd, it.x + (it.w || 0));
          continue;
        }
        if (lastEnd != null) {
          const gap = it.x - lastEnd;
          if (gap > tabGap) text += '\t';
          else if (gap > L.h * 0.15 && !/\s$/.test(text) && !/^\s/.test(it.s)) text += ' ';
        }
        text += it.s;
        lastEnd = it.x + (it.w || 0);
      }
      text = text.replace(/[ \u00a0]+/g, ' ').replace(/ *\t[\t ]*/g, '\t').trim();
      if (!text) continue;
      const boldShare = L.items.filter(i => i.bold && i.s.trim()).length / Math.max(1, L.items.filter(i => i.s.trim()).length);
      out.push({ text, x: L.items[0].x, right: lastEnd || 0, y: L.y, h: L.h, page: L.page, bold: boldShare > 0.6, size: Math.round(L.h * 10) / 10 });
    }
    // merge wrapped lines into paragraphs
    const paras = [];
    const bodySize = median(out.map(l => l.size)) || 10;
    const maxRight = Math.max(...out.map(l => l.right || 0), 1);
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      const isBullet = BULLET_RE.test(l.text);
      const prev = paras[paras.length - 1];
      const prevLine = out[i - 1];
      const gap = prevLine && prevLine.page === l.page ? l.y - prevLine.y : 99;
      const wrapped = prevLine && prevLine.right > maxRight * 0.8; // previous line ran to the margin
      const cont = !!prev && !isBullet && !looksHeading(l.text, l.bold) && !/\t/.test(l.text) && !/\t/.test(prevLine.text) &&
        gap < l.h * 1.8 && Math.abs(l.size - prevLine.size) < 0.6 && !!l.bold === !!prevLine.bold && wrapped &&
        (prev.bullet ? l.x > prev.x - 1 : Math.abs(l.x - prevLine.x) < 4);
      if (cont) { prev.text += (/-$/.test(prev.text) ? '' : ' ') + l.text; continue; }
      const mid = (l.x + l.right) / 2;
      const centered = !isBullet && !/\t/.test(l.text) && l.x > 90 && Math.abs(mid - pageWidth / 2) < 12;
      paras.push({ text: l.text, bullet: isBullet, bold: l.bold, size: l.size, x: l.x, page: l.page, heading: false, big: l.size > bodySize * 1.35, align: centered ? 'center' : '' });
    }
    const r = finish('pdf', paras);
    r.pages = pdf.numPages; r.pageWidth = pageWidth; r.pageHeight = pageHeight; r.bodySize = bodySize;
    return r;
  }
  function median(a) { const s = a.filter(Boolean).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

  /* ---------------- classify ---------------- */
  function finish(kind, raw) {
    let section = 'header';
    const blocks = raw.map((b, i) => {
      const text = b.text.replace(BULLET_RE, '').replace(/[ ]{2,}/g, ' ').trim();
      const blk = { id: 'b' + i, text, type: 'text', section, bold: !!b.bold, size: b.size || 0 };
      if (b.pIndex !== undefined) blk.pIndex = b.pIndex;
      if (b.x !== undefined) blk.x = b.x;
      if (b.page !== undefined) blk.page = b.page;
      if (b.align) blk.align = b.align;
      const sec = !b.bullet && (b.heading || looksHeading(text, b.bold || b.big)) ? (sectionOf(text) || (section !== 'header' ? 'other' : null)) : null;
      if (sec) { section = sec; blk.type = 'heading'; blk.section = sec; return blk; }
      if (b.bullet) blk.type = 'bullet';
      else if (section === 'header' && i === 0) blk.type = 'name';
      else if (section === 'header') blk.type = 'contact';
      return blk;
    });
    // group bullets under the job / project / school header that precedes them
    let group = 0, inHeader = false;
    for (const b of blocks) {
      if (b.type === 'heading') { group++; inHeader = false; continue; }
      if (b.type === 'bullet') { b.group = 'g' + group; inHeader = false; continue; }
      if (!inHeader) { group++; inHeader = true; }
      b.group = 'g' + group;
      if (/(experience|projects|education|volunteer)/.test(b.section)) b.type = 'entry';
    }
    return { kind, blocks, text: blocks.map(b => (b.type === 'bullet' ? '• ' : '') + b.text).join('\n') };
  }

  async function parseFile(file) {
    const name = file.name || 'resume';
    const ab = file.arrayBuffer ? await file.arrayBuffer() : file.data;
    const isPdf = /\.pdf$/i.test(name) || /pdf/.test(file.type || '');
    const isDocx = /\.docx$/i.test(name) || /officedocument\.wordprocessingml/.test(file.type || '');
    if (!isPdf && !isDocx) throw new Error('Please choose a PDF or Word (.docx) file. Old .doc files: open in Word and "Save as" .docx.');
    const r = isPdf ? await parsePdf(ab) : await parseDocx(ab);
    r.name = name;
    if (r.text.replace(/\s/g, '').length < 80) throw new Error(isPdf ? 'This PDF has almost no selectable text (it may be a scanned image). Upload the Word version, or a PDF exported from Word / Google Docs.' : 'This Word file looks empty.');
    return r;
  }

  /* ---------------- deterministic extraction (before the model) ---------------- */
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3}[\s.-]?\d{3,4}\b/;
  const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|dev|me|net|org|app|ai|co|so|xyz|tech|site|page|info|us|uk|de|ca)(?:\/[^\s|,;)]*)?/gi;
  function deterministic(text) {
    const t = String(text || '');
    const out = {};
    const em = t.match(EMAIL_RE); if (em) out.email = em[0];
    const ph = t.replace(EMAIL_RE, ' ').match(PHONE_RE); if (ph && ph[0].replace(/\D/g, '').length >= 9) out.phone = ph[0].trim();
    const urls = (t.replace(EMAIL_RE, ' ').match(URL_RE) || []).map(u => u.replace(/[.)]+$/, ''));
    const seen = new Set();
    out.links = [];
    for (let u of urls) {
      if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
      const k = u.toLowerCase().replace(/\/$/, '');
      if (seen.has(k)) continue; seen.add(k);
      if (/linkedin\.com\/in\//i.test(u)) out.linkedin = out.linkedin || u;
      else if (/github\.com\/[^/\s]+/i.test(u)) out.github = out.github || u;
      else out.links.push(u);
    }
    if (out.links.length) out.portfolio = out.links[0];
    return out;
  }
  // Very rough first guess of the name: the first block if it looks like 2-4 words of letters.
  function guessName(blocks) {
    const b = blocks.find(x => x.type === 'name') || blocks[0];
    const s = b ? b.text.split(/[|\t,]/)[0].trim() : '';
    if (/^[\p{L}'’.-]+(\s+[\p{L}'’.-]+){1,3}$/u.test(s) && !/@|\d/.test(s)) {
      const parts = s.split(/\s+/);
      return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    return {};
  }
  const DATE_RANGE_RE = /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d\d)\s*(?:[-–—]|to)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d\d|present|current|now|today)/i;

  // Facts check: does a model-extracted value appear in the resume text?
  const squash = s => String(s || '').toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, '');
  function inText(value, text) {
    const v = squash(value);
    if (!v) return false;
    return squash(text).includes(v);
  }
  function wordsInText(value, text, share) {
    const words = String(value || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 2);
    if (!words.length) return false;
    const T = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ') + ' ';
    const hit = words.filter(w => T.includes(' ' + w.replace(/\.$/, '') + ' ') || T.includes(w)).length;
    return hit / words.length >= (share || 0.8);
  }

  /* Merge the model's JSON with the deterministic facts and drop anything not in the resume. */
  function validateExtraction(model, parsed) {
    const text = parsed.text;
    const det = deterministic(text);
    const m = model && typeof model === 'object' ? model : {};
    const str = v => (v == null ? '' : String(v)).trim();
    const out = { dropped: [] };
    const keep = (k, v, check) => { v = str(v); if (!v) return; if (check && !check(v)) { out.dropped.push(k + ': ' + v); return; } out[k] = v; };
    const name = guessName(parsed.blocks);
    keep('firstName', m.firstName || m.first_name || name.firstName, v => inText(v, text));
    keep('lastName', m.lastName || m.last_name || name.lastName, v => inText(v, text));
    out.email = det.email || ''; out.phone = det.phone || '';
    out.linkedin = det.linkedin || ''; out.github = det.github || ''; out.portfolio = det.portfolio || '';
    keep('location', m.location, v => wordsInText(v, text, 0.6));
    // one location only: the one in the header/contact lines if there is one, else the first one the model gave
    const contactTxt = (parsed.blocks || []).filter(b => b.type === 'contact' || b.type === 'name').map(b => b.text).join(' | ');
    const hdr = contactTxt.match(/\b([A-Z][a-zA-Z.'-]+(?: [A-Z][a-zA-Z.'-]+){0,3}),\s*([A-Z]{2})\b(?!\w)/);
    if (hdr) out.location = hdr[1] + ', ' + hdr[2];
    else if (out.location && out.location.split(',').length > 2) out.location = out.location.split(/\s*,\s*/).slice(0, 2).join(', ');
    keep('city', m.city, v => inText(v, text));
    keep('state', m.state, v => inText(v, text));
    keep('country', m.country, v => inText(v, text));
    keep('summary', m.summary, v => wordsInText(v, text, 0.6));
    const arr = v => (Array.isArray(v) ? v : []);
    out.workHistory = arr(m.workHistory || m.work_history || m.experience).map(j => ({
      company: str(j.company), title: str(j.title), location: str(j.location), start: str(j.start || j.startDate), end: str(j.end || j.endDate),
      bullets: arr(j.bullets).map(str).filter(b => b && wordsInText(b, text, 0.7)).slice(0, 12)
    })).filter(j => {
      const ok = j.company && inText(j.company, text) && (!j.title || wordsInText(j.title, text, 0.7));
      if (!ok && (j.company || j.title)) out.dropped.push('job: ' + j.title + ' @ ' + j.company);
      return ok;
    }).map(j => { if (j.start && !inText(j.start, text)) j.start = ''; if (j.end && !/present|current/i.test(j.end) && !inText(j.end, text)) j.end = ''; return j; }).slice(0, 15);
    out.education = arr(m.education).map(e => ({ school: str(e.school || e.institution), degree: str(e.degree), field: str(e.field || e.major), start: str(e.start || e.startYear), end: str(e.end || e.endYear || e.year), location: str(e.location) }))
      .filter(e => { const ok = e.school && wordsInText(e.school, text, 0.7); if (!ok && e.school) out.dropped.push('school: ' + e.school); return ok; }).slice(0, 6);
    // skills: the items of the resume's own Skills section (exact text), plus validated model items
    const fromSection = [];
    for (const b of (parsed.blocks || []).filter(x => x.section === 'skills' && x.type !== 'heading')) {
      const body = b.text.includes(':') ? b.text.split(':').slice(1).join(':') : b.text;
      let depth = 0, cur = '';
      for (const ch of body + ',') {
        if (ch === '(') depth++; if (ch === ')') depth = Math.max(0, depth - 1);
        if ((ch === ',' || ch === ';' || ch === '•' || ch === '|') && !depth) { const t = cur.trim().replace(/\.$/, ''); if (t && t.length <= 50) fromSection.push(t); cur = ''; } else cur += ch;
      }
    }
    const modelSkills = arr(m.skills).map(str).filter(s => s && s.length < 60 && wordsInText(s, text, 0.99));
    const seenSk = new Set();
    out.skills = fromSection.concat(modelSkills).filter(s => { const k = s.toLowerCase(); if (seenSk.has(k)) return false; seenSk.add(k); return true; }).slice(0, 60);
    out.certifications = arr(m.certifications).map(str).filter(c => c && wordsInText(c, text, 0.7)).slice(0, 20);
    out.languages = arr(m.languages).map(str).filter(c => c && inText(c, text)).slice(0, 10);
    if (out.workHistory[0]) { out.currentEmployer = /present|current|now/i.test(out.workHistory[0].end) ? out.workHistory[0].company : ''; out.currentTitle = out.currentEmployer ? out.workHistory[0].title.split(/\s+[·|•]\s+|\s+\/\s+/)[0] : ''; out.currentStartDate = out.currentEmployer ? out.workHistory[0].start : ''; }
    // years of experience from the date ranges (first start year to now)
    // (work history only: school and project dates don't count)
    let years = out.workHistory.map(j => +(String(j.start || '').match(/(19|20)\d\d/) || [])[0]).filter(Boolean);
    if (!years.length) {
      const expText = (parsed.blocks || []).filter(b => b.section === 'experience').map(b => b.text).join('\n');
      years = (expText.match(new RegExp(DATE_RANGE_RE.source, 'gi')) || []).map(r => +(r.match(/(19|20)\d\d/) || [])[0]).filter(Boolean);
    }
    if (years.length) out.yearsExperience = String(Math.max(0, new Date().getFullYear() - Math.min(...years)));
    return out;
  }

  // Apply an extracted (and user-confirmed) patch onto a stored profile without wiping what's there.
  function applyToProfile(profile, patch, chosen) {
    const p = JSON.parse(JSON.stringify(profile || {}));
    const take = k => !chosen || chosen.includes(k);
    for (const k of ['firstName', 'lastName', 'email', 'phone', 'linkedin', 'github', 'portfolio', 'location', 'city', 'state', 'country', 'summary', 'currentEmployer', 'currentTitle', 'currentStartDate', 'yearsExperience']) {
      if (patch[k] && take(k)) p[k] = patch[k];
    }
    for (const k of ['workHistory', 'skills', 'certifications', 'languages']) if (patch[k] && patch[k].length && take(k)) p[k] = patch[k];
    if (patch.education && patch.education.length && take('education')) {
      p.educationList = patch.education;
      const e = patch.education[0];
      p.education = Object.assign({}, p.education || {}, { school: e.school, degree: e.degree, field: e.field, location: e.location || '', startYear: (e.start.match(/(19|20)\d\d/) || [''])[0], endYear: (e.end.match(/(19|20)\d\d/) || [''])[0] });
    }
    if (!p.signature && p.firstName) p.signature = (p.firstName + ' ' + (p.lastName || '')).trim();
    return p;
  }

  const api = { parseFile, parseDocx, parsePdf, docxParagraphs, paraText, finish, sectionOf, deterministic, guessName, validateExtraction, applyToProfile, inText, wordsInText, BULLET_RE, DATE_RANGE_RE, W };
  JAA.resume = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
