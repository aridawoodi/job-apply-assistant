/* Resume match on job posting pages (v0.5): a small dismissible card with a score ring,
 * "Matches X of Y keywords", missing keywords and "Improve my match" (opens tailoring).
 * Deterministic keywords first (lib/match.js); optional local-AI refinement. Lazy (idle callback),
 * cached per job + resume + description in chrome.storage.local. Nothing leaves the computer. */
(function () {
  'use strict';
  if (window.__JAA_MATCH__) return;
  window.__JAA_MATCH__ = true;
  const JAA = window.JAA;
  const lib = () => JAA.match && JAA.match.lib;
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || {}); }); } catch (_) { res({}); } });
  const top = window.top === window;

  function adapter() { return JAA.sites.detect(location); }
  function jd() {
    const a = adapter();
    JAA.__jdMax = 12000;
    let t = '';
    try { t = (a.jobDescription ? a.jobDescription() : '') || ''; } catch (_) { t = ''; }
    JAA.__jdMax = 0;
    return t;
  }
  function isPosting() {
    const a = adapter();
    if (a.generic || a.stub) return false;
    if (/LinkedIn/.test(a.name) && !/\/jobs\//.test(location.pathname)) return false;
    return jd().length > 300;
  }
  async function resumeText() {
    if (JAA.demo && JAA.demo.resumeText) return JAA.demo.resumeText;
    const { resumeMaster, profile } = await chrome.storage.local.get(['resumeMaster', 'profile']);
    return lib().resumeTextOf(profile || {}, resumeMaster || null);
  }
  const memo = {};
  async function get(force, opts) {
    opts = opts || {};
    const text = jd();
    if (text.length < 120) return { none: true };
    const rt = await resumeText();
    if (!rt || rt.trim().length < 40) return { noResume: true };
    const key = JAA.jobKey(location.href);
    const rh = lib().hash(rt) + '|' + lib().hash(text);
    const { matchCache = {} } = JAA.demo ? { matchCache: {} } : await chrome.storage.local.get('matchCache');
    const hit = matchCache[key];
    if (!force && hit && hit.rh === rh) return hit.m;
    if (!force && memo[key] && memo[key].rh === rh) return memo[key].m;
    const info = (adapter().jobInfo ? adapter().jobInfo() : {}) || {};
    let aiKeywords = null;
    if (opts.ai) {
      const r = await send({ type: 'match:ai', text: text.slice(0, 6000) });
      if (r.ok && Array.isArray(r.keywords)) aiKeywords = r.keywords; else if (r.error) opts.aiError = r.error;
    } else if (hit && hit.rh === rh && hit.m && hit.m.aiKeywords) aiKeywords = hit.m.aiKeywords;
    const m = lib().analyze(text, rt, { company: info.company || '', aiKeywords });
    if (aiKeywords) m.aiKeywords = aiKeywords;
    if (opts.aiError) m.aiError = opts.aiError;
    m.at = Date.now();
    memo[key] = { rh, m };
    if (!JAA.demo) {
      matchCache[key] = { rh, m, at: Date.now() };
      const keys = Object.keys(matchCache).sort((a, b) => (matchCache[a].at || 0) - (matchCache[b].at || 0));
      while (keys.length > 60) delete matchCache[keys.shift()];
      await chrome.storage.local.set({ matchCache });
    }
    return m;
  }
  function ring(h, pct) {
    const c = pct >= 70 ? '#16a34a' : pct >= 45 ? '#d97706' : '#dc2626';
    return h('div', { class: 'ring', style: `--p:${pct};--c:${c}`, role: 'img', 'aria-label': `Match ${pct}%` }, h('b', { text: pct + '%' }));
  }
  // shared with the panel's Resume tab
  function render(h, m, opts) {
    opts = opts || {};
    if (!m || m.none) return h('div', { class: 'muted', text: 'No job description found on this page.' });
    if (m.noResume) return h('div', { class: 'muted', text: 'Add your resume in Setup to see how well you match each job.' });
    const lim = opts.full ? 30 : 6;
    const box = h('div', { class: 'mres', 'data-score': String(m.score) },
      h('div', { style: 'display:flex;gap:12px;align-items:center' }, ring(h, m.score),
        h('div', {}, h('div', { style: 'font-weight:700;font-size:14px', text: `Matches ${m.matchedCount} of ${m.total} keywords` }),
          h('div', { class: 'muted', style: 'font-size:12px', text: m.score >= 70 ? 'Strong match' : m.score >= 45 ? 'Decent match: tailoring can help' : 'Low match: tailor your resume for this one' }))));
    if (m.missing.length) box.append(h('div', { style: 'margin-top:8px;font-size:12px;font-weight:600', text: 'Missing from your resume' }), h('div', { class: 'kw' }, m.missing.slice(0, lim).map(k => h('span', { class: 'miss', text: k })), m.missing.length > lim ? h('span', { class: 'miss', text: `+${m.missing.length - lim}` }) : null));
    if (opts.full && m.matched.length) box.append(h('div', { style: 'margin-top:8px;font-size:12px;font-weight:600', text: 'Already in your resume' }), h('div', { class: 'kw' }, m.matched.slice(0, lim).map(k => h('span', { text: k }))));
    if (m.aiKeywords) box.append(h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px', text: '✦ Keywords refined by your local AI' }));
    if (m.aiError) box.append(h('div', { class: 'muted', style: 'margin-top:6px;font-size:11px', text: 'Local AI refinement failed: ' + m.aiError }));
    return box;
  }

  const CSS = `
    :host{all:initial}
    .card{position:fixed;top:76px;right:20px;z-index:2147483645;width:300px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.18);padding:12px 14px;font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
    .hd{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;color:#4338ca;margin-bottom:8px}
    .x{margin-left:auto;border:0;background:none;font-size:18px;line-height:1;cursor:pointer;color:#64748b}
    .muted{color:#64748b}
    .ring{--p:0;width:64px;height:64px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--c,#6366f1) calc(var(--p)*1%),#e2e8f0 0)}
    .ring b{width:50px;height:50px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font:800 16px/1 inherit;color:#1e1b4b}
    .kw{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.kw span{border-radius:99px;padding:2px 8px;font-size:11px;background:#dcfce7;color:#166534}.kw span.miss{background:#fee2e2;color:#991b1b}
    .row{display:flex;gap:6px;margin-top:10px}
    button.p{flex:1;border:0;border-radius:9px;background:#4f46e5;color:#fff;font:700 12.5px/1 inherit;padding:9px 10px;cursor:pointer}
    button.s{border:1px solid #e2e8f0;border-radius:9px;background:#fff;color:#334155;font:600 12.5px/1 inherit;padding:9px 10px;cursor:pointer}
    .ft{display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:#94a3b8}
    .ft a{color:#64748b;cursor:pointer;text-decoration:underline}`;
  let host = null;
  function removeCard() { if (host) { host.remove(); host = null; } }
  async function showCard(m) {
    removeCard();
    const h = JAA.ui.h;
    host = document.createElement('div');
    host.id = 'jaa-match-host';
    const root = host.attachShadow({ mode: 'open' });
    const st = document.createElement('style'); st.textContent = CSS;
    const key = JAA.jobKey(location.href);
    const card = h('div', { class: 'card', role: 'dialog', 'aria-label': 'Resume match' },
      h('div', { class: 'hd' }, 'Resume match', h('button', { class: 'x', type: 'button', 'data-act': 'dismiss', title: 'Hide for this job', text: '×', onclick: async () => {
        removeCard();
        if (JAA.demo) return;
        const { matchDismissed = {} } = await chrome.storage.local.get('matchDismissed');
        matchDismissed[key] = Date.now();
        const ks = Object.keys(matchDismissed); if (ks.length > 200) delete matchDismissed[ks[0]];
        await chrome.storage.local.set({ matchDismissed });
      } })),
      render(h, m),
      m.noResume ? null : h('div', { class: 'row' },
        h('button', { class: 'p', type: 'button', 'data-act': 'improve', text: '✨ Improve my match', onclick: () => { if (JAA.chat) JAA.chat.tailorResume(); } }),
        h('button', { class: 's', type: 'button', 'data-act': 'details', text: 'Details', onclick: () => { if (JAA.chat) JAA.chat.openPanel('resume'); } })),
      h('div', { class: 'ft' }, h('span', { text: '🔒 Scored on your computer' }), h('a', { 'data-act': 'never', text: 'Don\'t show match cards', onclick: async () => {
        removeCard();
        if (JAA.demo) return;
        const r = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: Object.assign({}, r.settings || {}, { showMatch: false }) });
        if (JAA.ui && JAA.ui.toast) JAA.ui.toast('Match cards turned off', 'info', 'Turn them back on in Options → Behaviour');
      } })));
    root.append(st, card);
    document.documentElement.appendChild(host);
    return host;
  }
  async function maybeShow(force) {
    if (!top) return;
    const { settings } = await JAA.loadAll();
    if (settings.showMatch === false && !force) return;
    if (!isPosting()) return;
    // not on the application form itself (the panel's Resume tab has it there)
    if (!force && JAA.frameHasForm && JAA.frameHasForm()) return;
    const key = JAA.jobKey(location.href);
    if (!force && !JAA.demo) { const { matchDismissed = {} } = await chrome.storage.local.get('matchDismissed'); if (matchDismissed[key]) return; }
    const m = await get(false, {});
    if (m.none) return;
    if (!JAA.demo) send({ type: 'page:status', kind: 'posting', site: adapter().name });
    return showCard(m);
  }
  JAA.match = Object.assign(JAA.match || {}, { isPosting, get, render, ring, showCard, removeCard, maybeShow });

  if (!top || window.__JAA_INJECTED_BY_POPUP__ || location.protocol === 'chrome-extension:') return;
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 200));
  let lastUrl = location.href;
  const run = () => setTimeout(() => idle(() => maybeShow().catch(() => {}), { timeout: 3000 }), 1200);
  run();
  // SPA job boards (LinkedIn, Ashby): re-check when the URL changes
  setInterval(() => { if (location.href !== lastUrl) { lastUrl = location.href; removeCard(); run(); } }, 1500);
})();
