/* Learns the user's own answers. After a fill, every yellow (unresolved), blue (AI-drafted) and
 * saved-answer (green from the bank) field is watched; when the user types/picks a final value (change/blur), at their Submit, or when
 * they press "Save answers now", the question -> answer pair goes to the answer bank via the
 * background worker, which de-duplicates similar questions. */
(function () {
  'use strict';
  if (window.__JAA_LEARN__) return;
  window.__JAA_LEARN__ = true;
  const JAA = window.JAA;
  const C = JAA.core;

  let watched = [];   // { f, item, aiValue, lastSaved }
  let ctx = { company: '', site: '', url: '' };
  let timer = null;

  // profile-owned or sensitive rules are never learned (EEO answers live in the profile)
  const SKIP_RULES = new Set(['consent', 'botCheck', 'personal', 'ssn/dob', 'signature', 'date', 'salary', 'eduMonth', 'transgender', 'sexualOrientation', 'gender', 'hispanic', 'ethnicity', 'veteran', 'disability']);

  const readValue = f => C.readValue(f);

  function companyRe() {
    const c = String(ctx.company || '').trim();
    if (c.length < 3) return null;
    return '\\b' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b';
  }

  // -> entry or null (with reason) for one watched field
  function candidate(w, settings) {
    const f = w.f;
    if (f.kind === 'file') return null;
    if (f.kind === 'checkbox' && !f.question) return null; // lone checkbox = consent/terms
    if (f.el && (f.el.type === 'password' || /captcha/i.test(f.el.name + ' ' + f.el.id))) return null;
    const q = C.cleanLabel(f.question ? f.question + ' — ' + f.label : f.label);
    if (!q || q.length < 3) return null;
    const r = C.ruleFor(f);
    if (r && SKIP_RULES.has(r.key)) return null;
    if (JAA.NEVER_LEARN.test(JAA.normText(q))) return null;
    const a = readValue(f);
    if (!a) return null;
    // unedited AI draft (don't learn the model's guess) or unchanged saved answer
    if ((w.item.status === 'ai' || w.fromBank) && a === String(w.aiValue || '')) return null;
    if (a === w.lastSaved) return null;
    const pat = companyRe();
    if (pat && new RegExp(pat, 'i').test(q)) {
      // "Why Anthropic?" -> template "Why {company}?" flagged company-specific; only reused
      // directly when "learnCompanySpecific" is on, otherwise just shown to the model as an example
      const re = new RegExp(pat, 'gi');
      return { q: q.replace(re, '{company}'), a: a.replace(re, '{company}'), companySpecific: true, company: ctx.company, site: ctx.site, url: ctx.url, source: 'learned' };
    }
    return { q, a, companySpecific: false, company: ctx.company, site: ctx.site, url: ctx.url, source: 'learned' };
  }

  // Why a field can't be learned (for the chat), or '' if it can.
  function whyNot(f) {
    if (f.kind === 'file') return 'file uploads are never saved';
    if (f.el && (f.el.type === 'password' || /captcha/i.test(f.el.name + ' ' + f.el.id))) return 'passwords/captchas are never saved';
    if (f.kind === 'checkbox' && !f.question) return 'consent boxes are never saved';
    const r = C.ruleFor(f);
    if (r && SKIP_RULES.has(r.key)) return r.key === 'personal' ? 'personal questions are never saved' : (/consent|botCheck|signature|date/.test(r.key) ? 'consent/signature answers are never saved' : 'this one belongs in your profile, not the answer bank');
    const q = C.cleanLabel(f.question ? f.question + ' — ' + f.label : f.label);
    if (JAA.NEVER_LEARN.test(JAA.normText(q))) return 'personal/legal questions are never saved';
    return '';
  }
  // Watch a field that the user answered through the chat, then save it right away.
  async function saveField(f, item) {
    if (!watched.some(w => w.f.el === f.el)) { const w = { f, item, fromBank: false, aiValue: null, lastSaved: null }; watched.push(w); listenTo(w); }
    else { const w = watched.find(x => x.f.el === f.el); w.item = item; w.fromBank = false; w.aiValue = null; }
    return flush('chat', false, f.el);
  }

  async function flush(reason, force, onlyEl) {
    clearTimeout(timer);
    const { settings } = await JAA.loadAll();
    if (settings.rememberAnswers === false && !force) return 0;
    const picks = [];
    for (const w of watched) {
      if (onlyEl && w.f.el !== onlyEl) continue;
      const e = candidate(w, settings);
      if (e) { picks.push(e); w.pendingValue = readValue(w.f); }
    }
    if (!picks.length) return 0;
    const res = await new Promise(resolve => {
      try { chrome.runtime.sendMessage({ type: 'bank:learn', entries: picks, reason, force: !!force }, r => { void chrome.runtime.lastError; resolve(r); }); } catch (_) { resolve(null); }
    });
    if (res && res.ok) {
      watched.forEach(w => { if (w.pendingValue) { w.lastSaved = w.pendingValue; w.pendingValue = null; } });
      return (res.added || 0) + (res.updated || 0);
    }
    return 0;
  }
  const soon = () => { clearTimeout(timer); timer = setTimeout(() => flush('change'), 1200); };

  function listenTo(w) {
    const els = new Set([w.f.el].concat((w.f.options || []).map(o => o.el)).filter(Boolean));
    const ctl = w.f.kind === 'combobox' ? (w.f.el.closest('[class*="container" i]') || w.f.el.parentElement) : null;
    if (ctl) els.add(ctl);
    els.forEach(el => {
      el.addEventListener('change', e => { if (e.isTrusted) soon(); }, true);
      el.addEventListener('focusout', e => { if (e.isTrusted || document.hasFocus()) soon(); }, true);
      el.addEventListener('click', e => { if (e.isTrusted) soon(); }, true);
    });
  }

  JAA.learn = {
    // called by main.js after each fill run
    watch(fields, items, info) {
      ctx = { company: (info && info.company) || '', site: (info && info.site) || '', url: location.href };
      const byId = new Map(items.map(i => [i.id, i]));
      const keep = new Set(watched.map(w => w.f.el));
      for (const f of fields) {
        const item = byId.get(f.id);
        // yellow (needs you), blue (AI draft), and green fields that came from the answer bank
        // (so correcting a saved answer updates it); profile-rule fields belong to the profile
        const fromBank = item && item.status === 'ok' && item.source === 'bank';
        if (!item || !(item.status === 'todo' || item.status === 'ai' || fromBank)) continue;
        if (keep.has(f.el)) { const w = watched.find(x => x.f.el === f.el); w.item = item; w.fromBank = fromBank; if (item.status === 'ai' || fromBank) w.aiValue = item.value; continue; }
        const w = { f, item, fromBank, aiValue: (item.status === 'ai' || fromBank) ? item.value : null, lastSaved: null };
        watched.push(w);
        listenTo(w);
      }
      return watched.length;
    },
    flush,
    saveField,
    whyNot,
    readValue,
    candidates: () => watched.map(w => candidate(w, {})).filter(Boolean),
    count: () => watched.length
  };
})();
