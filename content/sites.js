/* Site adapters. Each one can tweak how fields are found/labelled and knows how
 * to read the company + job title for the tracker. */
(function () {
  'use strict';
  if (window.__JAA_SITES__) return;
  window.__JAA_SITES__ = true;
  const JAA = window.JAA = window.JAA || {};
  const t = el => (el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '');
  const q = s => document.querySelector(s);
  const meta = n => { const m = document.querySelector(`meta[property="${n}"], meta[name="${n}"]`); return m ? m.content.trim() : ''; };
  const pathPart = i => decodeURIComponent((location.pathname.split('/').filter(Boolean)[i] || '')).replace(/[-_]+/g, ' ');
  const titleCase = s => s.replace(/\b\w/g, c => c.toUpperCase());
  // Job description text for the AI (essays + chat). Falls back to meta description.
  function descriptionFrom(sels) {
    for (const sel of sels) {
      const el = q(sel);
      const txt = el && t(el);
      if (txt && txt.length > 200) return txt.slice(0, JAA.__jdMax || 4000);
    }
    return meta('og:description') || meta('description') || '';
  }
  // "Step 2 of 5" style indicators: explicit text, ARIA progress bars, or step lists.
  function genericStep(scope) {
    scope = scope || document;
    const cands = Array.from(scope.querySelectorAll('[class*="progress" i], [class*="step" i], [role="progressbar"], [aria-label*="step" i], [aria-label*="progress" i], nav, header, h2, h3, legend, p, span'))
      .filter(el => !el.closest('#jaa-host')).slice(0, 400);
    for (const el of cands) {
      const m = (t(el) + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('aria-valuetext') || '')).match(/\b(?:step|page|section)\s*(\d{1,2})\s*(?:of|\/)\s*(\d{1,2})\b/i);
      if (m && +m[1] <= +m[2]) return { n: +m[1], total: +m[2], label: '' };
    }
    const bar = scope.querySelector('[role="progressbar"][aria-valuenow]');
    if (bar) {
      const now = +bar.getAttribute('aria-valuenow'), max = +(bar.getAttribute('aria-valuemax') || 100);
      if (max > 0 && max <= 20 && now >= 1) return { n: now, total: max, label: '' };
      if (max === 100 && now >= 0) return { pct: Math.round(now), label: '' };
    }
    const list = Array.from(scope.querySelectorAll('[class*="step" i] [aria-current="step"], [aria-current="step"]'))[0];
    if (list) {
      const items = Array.from(list.parentElement.children);
      return { n: items.indexOf(list) + 1, total: items.length, label: t(list).slice(0, 60) };
    }
    return null;
  }
  const commonIgnore = el =>
    !!el.closest('#jaa-host') ||
    /recaptcha|hcaptcha|captcha/i.test(el.name + ' ' + el.id + ' ' + (el.className || '')) ||
    /^iti-\d+__search-input$/.test(el.id); // phone country-code search box

  const greenhouse = {
    name: 'Greenhouse',
    match: l => /(^|\.)greenhouse\.io$/.test(l.hostname),
    formRoot: () => q('#application-form') || q('#application_form') || q('form#application') || q('form[action*="greenhouse"]') || q('.application--form') || document,
    ignore: el => commonIgnore(el) || el.id === 'security_code',
    jobInfo() {
      const params = new URLSearchParams(location.search);
      const title = t(q('h1.app-title')) || t(q('.job__title h1')) || t(q('.job__title')) || t(q('h1')) || document.title;
      const company = t(q('.company-name')).replace(/^at\s+/i, '') || meta('og:site_name') ||
        (params.get('for') ? titleCase(params.get('for').replace(/[-_]+/g, ' ')) : '') ||
        (location.hostname.startsWith('job-boards') || location.hostname.startsWith('boards') ? titleCase(pathPart(0)) : '');
      return { title, company };
    },
    jobDescription: () => descriptionFrom(['.job__description', '#content .job-post', '.job-post-content', '#content', '.content-intro']),
    stepInfo: () => genericStep()
  };

  const lever = {
    name: 'Lever',
    match: l => /(^|\.)lever\.co$/.test(l.hostname),
    formRoot: () => q('#application-form') || q('form[action*="apply"]') || q('.application-form') || document,
    needsApplyPage: () => !/\/apply\/?$/.test(location.pathname) && !q('#application-form, .application-form'),
    ignore: el => commonIgnore(el) || el.name === 'selectedLocation' || el.id === 'origin',
    labelFor(el) {
      const box = el.closest('.application-question');
      if (box && box.querySelectorAll('input:not([type=hidden]),textarea,select').length === 1) {
        const l = box.querySelector('.application-label .text') || box.querySelector('.application-label');
        if (l) return t(l);
      }
      return '';
    },
    jobInfo() {
      const title = t(q('.posting-headline h2')) || t(q('.posting-header h2')) || t(q('h2')) || document.title;
      const logo = q('.main-header-logo img');
      const company = (logo && logo.alt && !/logo/i.test(logo.alt) ? logo.alt : '') || titleCase(pathPart(0));
      return { title, company };
    },
    jobDescription: () => descriptionFrom(['[data-qa="job-description"]', '.posting-page .section-wrapper.page-full-width', '.posting-description', '.content']),
    stepInfo: () => genericStep()
  };

  const ashby = {
    name: 'Ashby',
    match: l => /(^|\.)ashbyhq\.com$/.test(l.hostname),
    formRoot: () => q('.ashby-application-form-container') || q('[class*="application-form" i]') || q('form') || document,
    needsApplyPage: () => !/\/application\/?$/.test(location.pathname) && !q('.ashby-application-form-container, [class*="application-form" i] input'),
    ignore(el) {
      if (commonIgnore(el)) return true;
      if (el.type === 'file') {
        const box = el.closest('[class*="autofill" i]') || el.closest('section, div[class*="upload" i]');
        if (box && /autofill/i.test(t(box)) && !/^_systemfield_resume$/.test(el.id)) return true;
      }
      return false;
    },
    // Ashby renders Yes/No questions as two <button>s instead of radios.
    extraFields(root, api) {
      const btns = Array.from(root.querySelectorAll('button')).filter(b => /^yes$/i.test(t(b)));
      for (const yes of btns) {
        const box = yes.parentElement;
        const no = box && Array.from(box.querySelectorAll('button')).find(b => /^no$/i.test(t(b)));
        if (!no || api.seen.has(yes)) continue;
        api.seen.add(yes); api.seen.add(no);
        const r = api.climbLabel(yes, [], ['Yes', 'No']);
        // climbLabel stops at containers holding other inputs; Ashby yes/no boxes often have a hidden checkbox, so look for the field title directly too
        const fieldBox = yes.closest('[class*="field-entry" i], [class*="question" i], [class*="fieldEntry" i]') || r.container;
        const titleEl = fieldBox && fieldBox.querySelector('label, [class*="title" i]');
        const label = api.cleanLabel(titleEl ? t(titleEl) : r.text);
        api.push({ kind: 'buttons', el: yes, label, container: box, name: '', idAttr: '', required: false,
          options: [{ text: 'Yes', el: yes }, { text: 'No', el: no }] });
      }
    },
    jobInfo() {
      const title = t(q('h1[class*="title" i]')) || t(q('h1')) || meta('og:title') || document.title;
      const company = meta('og:site_name') || (document.title.includes('@') ? document.title.split('@').pop().trim() : '') || titleCase(pathPart(0));
      return { title, company };
    },
    jobDescription: () => descriptionFrom(['[class*="_descriptionText"]', '[class*="description" i]', '.ashby-job-posting-right-pane']),
    stepInfo: () => genericStep()
  };

  // ---- Workday (basic) --------------------------------------------------------
  // Multi-page wizard (My Information -> My Experience -> Application Questions ->
  // Voluntary Disclosures -> Review). Fields carry data-automation-id attributes and
  // dropdowns are <button aria-haspopup="listbox">. Sign-in / account creation pages are
  // left to the user. We fill the visible step only; the user presses "Save and Continue".
  const WD_ACCOUNT = '[data-automation-id="createAccountLink"], [data-automation-id="createAccountSubmitButton"], [data-automation-id="signInSubmitButton"], [data-automation-id="signInContent"], input[data-automation-id="password"], input[type="password"]';
  const workday = {
    name: 'Workday',
    match: l => /(^|\.)myworkdayjobs\.com$|(^|\.)myworkday\.com$|(^|\.)myworkdaysite\.com$/.test(l.hostname),
    formRoot: () => q('[data-automation-id="applyFlowPage"]') || q('main form') || q('[data-automation-id*="Page" i]') || document,
    accountPage: () => !!q(WD_ACCOUNT),
    accountNote: 'This is the Workday sign-in / create-account page. Please sign in or create the account yourself (I never handle passwords). Once the application steps appear, I\'ll fill each one.',
    needsApplyPage: () => !q('[data-automation-id="applyFlowPage"], [data-automation-id^="formField"]'),
    ignore: el => commonIgnore(el) || el.type === 'password' || /searchBox|globalSearch/i.test(el.getAttribute('data-automation-id') || ''),
    labelFor(el) {
      const box = el.closest('[data-automation-id^="formField"]');
      if (!box) return '';
      const l = box.querySelector('label, [data-automation-id="formLabel"], legend');
      return l ? t(l) : '';
    },
    extraFields(root, api) {
      Array.from(root.querySelectorAll('button[aria-haspopup="listbox"]')).forEach(b => {
        if (api.seen.has(b) || b.closest('#jaa-host') || !b.getClientRects().length) return;
        api.seen.add(b);
        const box = b.closest('[data-automation-id^="formField"]') || b.parentElement;
        const l = box && box.querySelector('label, [data-automation-id="formLabel"], legend');
        api.push({ kind: 'listbutton', el: b, label: api.cleanLabel(l ? t(l) : (b.getAttribute('aria-label') || '')), container: box, name: b.name || '', idAttr: b.id || '', required: /\*/.test(l ? t(l) : '') });
      });
    },
    jobInfo() {
      const title = t(q('[data-automation-id="jobPostingHeader"]')) || t(q('h2[data-automation-id]')) || document.title.split('|')[0].trim();
      const company = meta('og:site_name') || titleCase(location.hostname.split('.')[0].replace(/\d+$/, ''));
      return { title, company };
    },
    jobDescription: () => descriptionFrom(['[data-automation-id="jobPostingDescription"]']),
    stepInfo() {
      const bar = q('[data-automation-id="progressBar"]');
      if (bar) {
        const items = Array.from(bar.querySelectorAll('li'));
        const act = bar.querySelector('[data-automation-id="progressBarActiveStep"]');
        const i = act ? items.findIndex(li => li === act || li.contains(act)) : -1;
        if (items.length && i >= 0) return { n: i + 1, total: items.length, label: t(act).replace(/^current step \d+ of \d+\s*/i, '').slice(0, 60) };
      }
      return genericStep();
    }
  };

  // ---- LinkedIn Easy Apply (fill-only) ---------------------------------------------
  // A modal wizard, one step at a time. We fill the visible step only and never press
  // Next / Review / Submit application.
  const liModal = () => q('.jobs-easy-apply-modal') || q('[data-test-modal-id="easy-apply-modal"]') || Array.from(document.querySelectorAll('[role="dialog"]')).find(d => /apply to|easy apply/i.test(t(d).slice(0, 200)));
  const linkedin = {
    name: 'LinkedIn Easy Apply',
    match: l => /(^|\.)linkedin\.com$/.test(l.hostname),
    formRoot: () => liModal() || null,
    needsApplyPage: () => !liModal(),
    applyHint: 'Click "Easy Apply" on the job first; I fill the step that\'s open and never press Next or Submit.',
    ignore: el => commonIgnore(el) || !el.closest('.jobs-easy-apply-modal, [data-test-modal-id="easy-apply-modal"], [role="dialog"]'),
    jobInfo() {
      const m = liModal();
      const h = m && t(m.querySelector('h2, h3'));
      const company = (h && /apply to (.+)/i.test(h) ? h.match(/apply to (.+)/i)[1] : '') || t(q('.job-details-jobs-unified-top-card__company-name')) || '';
      const title = t(q('.job-details-jobs-unified-top-card__job-title')) || t(q('.jobs-unified-top-card__job-title')) || t(q('h1')) || document.title;
      return { title, company };
    },
    jobDescription: () => descriptionFrom(['#job-details', '.jobs-description__content', '.jobs-box__html-content']),
    stepInfo() {
      const m = liModal();
      if (!m) return null;
      const bar = m.querySelector('[role="progressbar"], progress');
      if (bar) {
        const v = +(bar.getAttribute('aria-valuenow') || bar.value || 0);
        if (v >= 0) return { pct: Math.round(v), label: t(m.querySelector('h3')).slice(0, 60) };
      }
      return genericStep(m);
    }
  };

  const generic = {
    name: 'Generic', generic: true,
    match: () => true,
    formRoot: () => document,
    ignore: commonIgnore,
    jobInfo() {
      return { title: meta('og:title') || t(q('h1')) || document.title, company: meta('og:site_name') || location.hostname.replace(/^www\./, '') };
    },
    jobDescription: () => descriptionFrom(['[class*="description" i]', 'main', 'article']),
    stepInfo: () => genericStep()
  };

  // the extension's own practice page (practice/practice.html): a fake form to try things safely
  const practice = {
    name: 'Practice',
    match: l => l.protocol === 'chrome-extension:' && /\/practice\//.test(l.pathname),
    formRoot: () => q('#application-form') || document,
    ignore: commonIgnore,
    jobInfo() { return { title: t(q('#job-title')), company: t(q('#job-company')) }; },
    jobDescription: () => descriptionFrom(['#job-description']),
    stepInfo: () => null
  };

  const LIST = [practice, greenhouse, lever, ashby, workday, linkedin];

  // ---- job card details: location, salary, posted age, logo (v0.5) ----------------------
  // JSON-LD JobPosting first (many boards publish it), then site selectors, then text patterns.
  function ldJob() {
    for (const sc of document.querySelectorAll('script[type="application/ld+json"]')) {
      let j; try { j = JSON.parse(sc.textContent); } catch (_) { continue; }
      const list = Array.isArray(j) ? j : (j['@graph'] || [j]);
      const hit = list.find(x => x && /JobPosting/.test([].concat(x['@type'] || []).join(' ')));
      if (hit) return hit;
    }
    return null;
  }
  const LOC_SEL = ['.job__location', '.location', '.posting-categories .location', '.posting-category.location', '[data-qa="posting-location"]', '[data-automation-id="locations"]',
    '[class*="_location" i]', '.job-details-jobs-unified-top-card__primary-description-container .tvm__text', '.jobs-unified-top-card__bullet', '#job-location'];
  const SALARY_RE = /(?:[$£€]\s?\d[\d,.]*\s?[kK]?|\d[\d,.]*\s?[kK]?\s?(?:USD|EUR|GBP))\s?(?:-|–|—|to)\s?(?:[$£€]\s?)?\d[\d,.]*\s?[kK]?(?:\s?(?:USD|EUR|GBP))?(?:\s?(?:per|\/|a)\s?(?:year|yr|annum|hour|hr))?/;
  const AGE_RE = /\b(?:posted|listed|published)\s*(?:on\s*)?:?\s*((?:\d+\+?\s*(?:minutes?|hours?|days?|weeks?|months?)\s*ago)|today|yesterday|just now)|\b(\d+\+?\s*(?:minutes?|hours?|days?|weeks?|months?)\s*ago)\b/i;
  function ageFrom(iso) {
    const d = Date.parse(iso); if (!d) return '';
    const days = Math.floor((Date.now() - d) / 864e5);
    if (days < 0) return '';
    if (days === 0) return 'today'; if (days === 1) return 'yesterday';
    if (days < 31) return days + ' days ago';
    const m = Math.floor(days / 30); return m < 12 ? m + (m === 1 ? ' month ago' : ' months ago') : 'over a year ago';
  }
  function fmtSalary(b) {
    if (!b || typeof b !== 'object') return '';
    const v = b.value || {}; const cur = b.currency || v.currency || '';
    const sym = { USD: '$', EUR: '€', GBP: '£' }[cur] || (cur ? cur + ' ' : '');
    const n = x => x >= 1000 ? Math.round(x / 1000) + 'k' : String(x);
    const unit = { YEAR: '/yr', HOUR: '/hr', MONTH: '/mo' }[(v.unitText || '').toUpperCase()] || '';
    if (v.minValue && v.maxValue) return `${sym}${n(+v.minValue)} – ${sym}${n(+v.maxValue)}${unit}`;
    if (v.value) return `${sym}${n(+v.value)}${unit}`;
    return '';
  }
  JAA.jobMeta = function () {
    const a = JAA.sites.detect(location);
    const info = (a.jobInfo ? a.jobInfo() : {}) || {};
    const out = { title: info.title || '', company: info.company || '', location: '', salary: '', posted: '', logo: '', site: a.name };
    const ld = ldJob();
    if (ld) {
      const loc = [].concat(ld.jobLocation || [])[0];
      const addr = loc && loc.address ? loc.address : null;
      if (addr) out.location = [addr.addressLocality, addr.addressRegion, addr.addressCountry && typeof addr.addressCountry === 'string' && addr.addressCountry.length > 3 ? addr.addressCountry : ''].filter(Boolean).join(', ');
      if (/TELECOMMUTE/i.test(ld.jobLocationType || '')) out.location = out.location ? out.location + ' · Remote' : 'Remote';
      out.salary = fmtSalary(ld.baseSalary);
      out.posted = ageFrom(ld.datePosted);
      const org = ld.hiringOrganization || {};
      if (org.logo) out.logo = typeof org.logo === 'string' ? org.logo : org.logo.url || '';
      if (!out.company && org.name) out.company = org.name;
    }
    if (!out.location) for (const sel of LOC_SEL) { const el = q(sel); const v = t(el); if (v && v.length < 90 && !el.closest('#jaa-host')) { out.location = v.replace(/^location:?\s*/i, ''); break; } }
    const text = (descriptionFrom(['#job-description', '.job__description', '[data-qa="job-description"]', '[class*="_descriptionText"]', '[data-automation-id="jobPostingDescription"]', '#job-details', '.jobs-description__content', 'main']) || '').slice(0, 8000);
    if (!out.salary) { const m = text.match(SALARY_RE) || t(document.body).slice(0, 20000).match(SALARY_RE); if (m) out.salary = m[0].replace(/\s+/g, ' ').trim(); }
    if (!out.posted) {
      const wd = t(q('[data-automation-id="postedOn"]'));
      const m = (wd || t(q('.jobs-unified-top-card__posted-date')) || t(q('.job-details-jobs-unified-top-card__primary-description-container')) || t(document.body).slice(0, 6000)).match(AGE_RE);
      if (m) out.posted = (m[1] || m[2] || '').toLowerCase();
    }
    if (!out.logo) {
      const ic = q('link[rel="apple-touch-icon"]') || q('link[rel~="icon"]');
      if (ic && ic.href && /^https:/.test(ic.href)) out.logo = ic.href;
      else if (location.protocol === 'https:') out.logo = location.origin + '/favicon.ico';
    }
    return out;
  };
  JAA.sites = {
    list: LIST,
    generic,
    genericStep,
    detect(loc) { return LIST.find(a => a.match(loc || location)) || generic; }
  };
})();
