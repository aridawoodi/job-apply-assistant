/* v0.6.7 "does this page look like a job application?" for sites that aren't built in.
 * features(doc) reads the page (labels, headings, URL, form fields; open shadow roots best effort) and
 * score(features) turns that into a number. Only at or above THRESHOLD does the Fill button appear by
 * itself; below it nothing is shown, but Fill from the toolbar popup still works. Runs on the page only;
 * nothing is stored or sent. */
(function (g) {
  'use strict';
  const THRESHOLD = 6;
  // keyword groups: each group counts once (so repeating a word can't inflate the score)
  const KEYWORDS = [
    ['apply', /\b(apply|application|applicant|candidate|job opening|position)\b/],
    ['resume', /\b(resume|résumé|curriculum vitae|cv)\b/],
    ['cover', /\bcover letter\b/],
    ['auth', /\b(work authori[sz]ation|authori[sz]ed to work|legally (eligible|authori[sz]ed)|sponsorship|visa)\b/],
    ['experience', /\b(years of (relevant |professional )?experience|work experience|employment history|current (employer|company|title)|previous employer)\b/],
    ['eeo', /\b(equal (employment )?opportunity|eeo|voluntary self.?identification|veteran status|disability status)\b/],
    ['links', /\b(linked ?in( profile)?|portfolio|github)\b/],
    ['terms', /\b(salary expectations?|desired (salary|pay|compensation)|notice period|earliest start date|willing to relocate)\b/]
  ];
  const NEGATIVE = /\b(contact us|get in touch|send us a message|newsletter|subscribe|checkout|payment|credit card|card number|billing|shipping|log ?in|sign ?in|create (an )?account|forgot password|book a demo|request a demo|leave a comment|search jobs)\b/;
  const URL_HINT = /(^|[\/._?=-])(apply|application|applications|careers?|jobs?|join-us|vacanc(y|ies)|recruit\w*|candidate)([\/._?=-]|$)/i;

  function score(f) {
    f = f || {};
    const why = [];
    let s = 0;
    if (f.resumeFile) { s += 4; why.push('resume upload'); } else if (f.docFile) { s += 2; why.push('document upload'); }
    const ident = (f.hasName ? 1 : 0) + (f.hasEmail ? 1 : 0) + (f.hasPhone ? 1 : 0);
    s += ident; if (ident === 3) s += 1;
    if (ident) why.push('contact fields ' + ident + '/3');
    const kw = (f.keywords || []).length;
    s += Math.min(kw, 4); if (kw) why.push('words: ' + f.keywords.join(', '));
    if (f.urlHint) { s += 1; why.push('URL'); }
    const n = f.fillable || 0;
    if (n >= 8) s += 2; else if (n >= 5) s += 1;
    if (f.password) { s -= 4; why.push('password field (sign-in)'); }
    if (f.negative) { s -= 2; why.push('not-a-job words: ' + f.negative); }
    return { score: s, ok: s >= THRESHOLD && n >= 3, threshold: THRESHOLD, why };
  }

  /* ---------- DOM side (content script) ---------- */
  const FILLABLE = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=search]):not([type=password]), textarea, select, [role="combobox"]:not(input), button[aria-haspopup="listbox"]';
  const txt = el => (el ? (el.innerText || el.textContent || '') : '').replace(/\s+/g, ' ').trim();
  // querySelectorAll that also looks inside open shadow roots (custom elements); closed roots can't be read
  function deepAll(root, sel, out, depth) {
    out = out || []; depth = depth || 0;
    if (!root || !root.querySelectorAll || depth > 6) return out;
    root.querySelectorAll(sel).forEach(e => out.push(e));
    root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) deepAll(e.shadowRoot, sel, out, depth + 1); });
    return out;
  }
  function visible(el) {
    if (!el.getClientRects || !el.getClientRects().length) return el.type === 'file' || el.type === 'radio' || el.type === 'checkbox'; // styled uploads/radios hide the real input
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function hintOf(el) {
    const root = el.getRootNode && el.getRootNode().getElementById ? el.getRootNode() : (el.ownerDocument || document);
    const parts = [];
    (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).forEach(id => parts.push(txt(root.getElementById(id))));
    if (el.id) { try { const l = root.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) parts.push(txt(l)); } catch (_) { /* ignore */ } }
    const wrap = el.closest && el.closest('label'); if (wrap) parts.push(txt(wrap));
    parts.push(el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || '', el.name || '', el.id || '', el.getAttribute('autocomplete') || '');
    if (!parts.join('').trim()) { const box = el.closest && el.closest('fieldset, [class*="field" i], [class*="question" i], [class*="form-group" i]'); if (box) parts.push(txt(box).slice(0, 120)); }
    return parts.join(' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.[\]]+/g, ' ').toLowerCase();
  }
  function features(doc, loc) {
    doc = doc || document; loc = loc || (doc.defaultView && doc.defaultView.location) || { pathname: '', search: '', hostname: '' };
    const els = deepAll(doc, FILLABLE).filter(e => !e.disabled && !(e.closest && e.closest('#jaa-host')) && visible(e));
    const groups = new Set();
    let fillable = 0;
    const out = { hasName: false, hasEmail: false, hasPhone: false, resumeFile: false, docFile: false, password: false, keywords: [], urlHint: false, negative: '', fillable: 0 };
    for (const el of els) {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if ((type === 'radio' || type === 'checkbox') && el.name) { if (groups.has(type + el.name)) continue; groups.add(type + el.name); }
      fillable++;
      const h = hintOf(el), ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      if (type === 'file') {
        const around = (h + ' ' + txt(el.closest && el.closest('fieldset, [class*="field" i], [class*="upload" i], div')).slice(0, 200)).toLowerCase();
        if (/\b(resume|r\u00e9sum\u00e9|cv|curriculum vitae)\b/.test(around)) out.resumeFile = true;
        if (/pdf|doc|word|officedocument/.test((el.accept || '').toLowerCase())) out.docFile = true;
        continue;
      }
      if (/^(given-name|family-name|name)$/.test(ac) || (/\b(first|last|full|given|family|legal)? ?name\b|\bfname\b|\blname\b/.test(h) && !/\b(company|user ?name|school|employer|reference|business|organi[sz]ation|file)\b/.test(h))) out.hasName = true;
      if (type === 'email' || ac === 'email' || /\be ?mail\b/.test(h)) out.hasEmail = true;
      if (type === 'tel' || /^tel/.test(ac) || /\b(phone|mobile|cell|telephone)\b/.test(h)) out.hasPhone = true;
    }
    out.fillable = fillable;
    out.password = deepAll(doc, 'input[type=password]').some(visible);
    const corpus = [doc.title || '']
      .concat(deepAll(doc, 'h1, h2, h3, h4, legend, label, [role="heading"], button, [type=submit]').slice(0, 400).map(txt))
      .concat(els.slice(0, 200).map(hintOf))
      .join(' \n ').toLowerCase().slice(0, 40000);
    out.keywords = KEYWORDS.filter(([, re]) => re.test(corpus)).map(([k]) => k);
    const neg = corpus.match(NEGATIVE); out.negative = neg ? neg[0] : '';
    out.urlHint = URL_HINT.test((loc.pathname || '') + (loc.search || '')) || /^(careers?|jobs?|apply|recruiting|talent)\./i.test(loc.hostname || '');
    return out;
  }
  function check(doc, loc) { const f = features(doc, loc); return Object.assign(score(f), { features: f }); }

  const api = { THRESHOLD, KEYWORDS, score, features, check, deepAll };
  g.JAA = g.JAA || {}; g.JAA.jobDetect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
