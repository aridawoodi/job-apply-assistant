/* Practice tour (practice.html?tour=1): 10 coach marks over the practice application.
 * Dims the page, spotlights one thing at a time, card with "n / 10", Back / Next.
 * Uses the demo person from demo.js. Nothing is sent, saved to your profile, or tracked. */
(function () {
  'use strict';
  const JAA = window.JAA;
  const touring = /[?&]tour=1\b/.test(location.search);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const jaa = sel => { const host = document.getElementById('jaa-host'); return host && host.shadowRoot ? host.shadowRoot.querySelector(sel) : null; };

  // page bar: start / restart
  const bar = document.createElement('div');
  bar.className = 'tourbar';
  bar.innerHTML = touring
    ? '<span>🎓</span><span><b>Practice tour</b> with a made-up person, Sam Sample. Nothing here is real or sent anywhere.</span><span class="sp"></span><button type="button" id="tourRestart">Restart tour</button>'
    : '<span>🎓</span><span>New here? Take the 2-minute tour with a made-up person.</span><span class="sp"></span><button type="button" id="tourStart">Start the tour</button>';
  const main = document.querySelector('main');
  main.insertBefore(bar, main.firstChild);
  const startBtn = document.getElementById('tourStart');
  if (startBtn) startBtn.onclick = () => { location.href = location.pathname + '?tour=1'; };
  if (!touring) return;
  document.body.classList.add('jaa-touring');
  document.getElementById('job-company').textContent = 'Example Co (pretend company)';

  const PIN_SVG = `<svg viewBox="0 0 320 120" width="100%" role="img" aria-label="Chrome toolbar: click the puzzle piece, then the pin">
    <rect x="1" y="1" width="318" height="44" rx="10" fill="#f1f5f9" stroke="#cbd5e1"/>
    <rect x="12" y="11" width="170" height="24" rx="12" fill="#fff" stroke="#e2e8f0"/><text x="24" y="27" font-size="11" fill="#94a3b8" font-family="system-ui">jobs.example.com/apply</text>
    <g transform="translate(224,12)"><rect width="22" height="22" rx="6" fill="#6366f1"/><text x="6" y="16" font-size="13" fill="#fff" font-family="system-ui">⚡</text></g>
    <g transform="translate(256,12)"><circle cx="11" cy="11" r="12" fill="#e0e7ff"/><text x="3" y="16" font-size="14" font-family="system-ui">🧩</text></g>
    <path d="M267 40 L267 58" stroke="#4f46e5" stroke-width="2" marker-end="url(#a)"/>
    <defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#4f46e5"/></marker></defs>
    <rect x="150" y="62" width="168" height="52" rx="10" fill="#fff" stroke="#cbd5e1"/>
    <g transform="translate(160,76)"><rect width="22" height="22" rx="6" fill="#6366f1"/><text x="6" y="16" font-size="13" fill="#fff" font-family="system-ui">⚡</text></g>
    <text x="190" y="91" font-size="11.5" fill="#0f172a" font-family="system-ui">AI Job Application Assistant</text>
    <text x="294" y="92" font-size="14" font-family="system-ui">📌</text>
    <circle cx="300" cy="87" r="13" fill="none" stroke="#f59e0b" stroke-width="2"/>
  </svg>`;

  const STEPS = [
    { id: 'pin', title: 'Pin the assistant', html: PIN_SVG + '<p>Click the puzzle piece 🧩 in Chrome\'s toolbar, then the pin 📌 next to <b>AI Job Application Assistant</b>. The icon turns <b>colorful</b> on job pages it supports and stays <b>gray</b> elsewhere.</p>' },
    { id: 'fill', title: 'One click to fill', target: () => jaa('.btn'), text: 'On a real application you press this button. It fills the form from your profile. Press <b>Next</b> and I\'ll press it for you here.', next: 'Fill it' },
    { id: 'progress', title: 'Watch it fill', target: () => jaa('.panel'), text: 'Each field ticks off as it\'s filled: ✓ from your profile, ✦ written by your local AI (check those). The checklists at the end jump to any field.', wait: () => JAA.chat && JAA.chat.hasRun() && !(JAA.isRunning && JAA.isRunning()), waitText: 'Filling…' },
    { id: 'saved', title: 'Saved answers', target: () => document.getElementById('q_sql').closest('label'), text: 'This answer came from your <b>saved answers</b>. Anything you type into a form can be remembered for next time (you choose), so you answer each question once.' },
    { id: 'refine', title: 'Refine with AI', target: () => { const t = document.getElementById('q_why'); return (t.__jaaRefine) || t; }, text: 'Under long answers: make it <b>shorter</b>, <b>more technical</b>, <b>more enthusiastic</b>, or say what you want. 👍 / 👎 teach future drafts your taste, stored only on this computer.', before: async () => { if (JAA.refine) await JAA.refine.sweep(); document.getElementById('q_why').scrollIntoView({ block: 'center' }); await sleep(400); } },
    { id: 'match', title: 'Resume match', target: () => jaa('.panel'), text: 'How well your resume covers this job\'s keywords, and what\'s missing. It\'s worked out on your computer. On job postings a small card shows it too.', before: async () => { JAA.chat.openPanel('resume'); await sleep(700); } },
    { id: 'tailor', title: 'Tailor your resume', target: () => jaa('[data-act="tailor"]') || jaa('.panel'), text: '<b>Improve my match</b> makes a version of your resume for this job: only rewording and reordering what\'s already true, and you approve each change. Cover letters work the same way.' },
    { id: 'review', title: 'Review before you submit', target: () => jaa('[data-h="review"]'), text: 'Review lists every field: what was filled, what the AI wrote, and what still needs you.', before: async () => { JAA.ui.tab('assistant'); if (JAA.chat && JAA.chat.hasRun()) JAA.chat.reviewCard(); await sleep(400); } },
    { id: 'submit', title: 'You press Submit', targets: () => [document.querySelector('.consent'), document.getElementById('submit')], text: 'The assistant never presses Submit, Next or Continue, and never ticks consent boxes. Tick the (fake) consent box yourself, then press <b>Submit application</b>. This one is pretend.', before: async () => { document.getElementById('submit').scrollIntoView({ block: 'center' }); await sleep(300); }, noNext: true },
    { id: 'done', final: true }
  ];

  let i = 0, host, root, hole, card, raf = 0, cleanup = null;
  function build() {
    host = document.createElement('div');
    host.id = 'jaa-tour-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{all:initial}
      .hole{position:fixed;border-radius:12px;box-shadow:0 0 0 4px rgba(99,102,241,.9),0 0 0 9999px rgba(15,23,42,.55);pointer-events:none;transition:all .25s ease;z-index:2147483640}
      .hole.none{box-shadow:0 0 0 9999px rgba(15,23,42,.55);width:0!important;height:0!important;left:50%!important;top:50%!important}
      .card{position:fixed;z-index:2147483647;width:340px;max-width:calc(100vw - 24px);background:#fff;border-radius:16px;box-shadow:0 18px 48px rgba(15,23,42,.35);padding:16px 18px;font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a;pointer-events:auto}
      .n{font:700 11px/1 inherit;color:#6366f1;letter-spacing:.04em;text-transform:uppercase}
      h3{margin:6px 0 6px;font-size:16px}p{margin:6px 0}
      .row{display:flex;gap:8px;align-items:center;margin-top:12px}.sp{flex:1}
      button{border:0;border-radius:9px;padding:8px 13px;font:700 13px/1 inherit;cursor:pointer}
      .p{background:#4f46e5;color:#fff}.p:disabled{opacity:.5;cursor:default}.s{background:#f1f5f9;color:#334155}.l{background:none;color:#64748b;padding:8px 4px;font-weight:600}
      .dots{display:flex;gap:4px}.dots i{width:6px;height:6px;border-radius:50%;background:#e2e8f0}.dots i.on{background:#6366f1}
      .wait{color:#64748b;font-size:12px}
      .modal{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0f172a}
      .mbox{background:#fff;border-radius:20px;padding:26px 28px;width:min(440px,92vw);text-align:center;box-shadow:0 24px 60px rgba(15,23,42,.4)}
      .mbox .big{font-size:46px;line-height:1}.mbox h2{margin:8px 0 6px;font-size:22px}
      .mbox ul{text-align:left;margin:10px 0 14px 18px;padding:0;color:#334155}
      .mbox .row{justify-content:center}
    </style><div class="hole none"></div><div class="card" role="dialog" aria-live="polite"></div>`;
    hole = root.querySelector('.hole'); card = root.querySelector('.card');
    document.documentElement.appendChild(host);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
  }
  function rectOf(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? r : null;
  }
  function union(rs) { rs = rs.filter(Boolean); if (!rs.length) return null; const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom)); return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t }; }
  function place() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const s = STEPS[i];
      if (!s || s.final) return;
      document.documentElement.appendChild(host); // stay above the assistant panel
      const r = s.targets ? union(s.targets().map(rectOf)) : rectOf(s.target && s.target());
      const W = innerWidth, H = innerHeight, pad = 8;
      if (!r) {
        hole.className = 'hole none';
        card.style.left = Math.max(12, (W - card.offsetWidth) / 2) + 'px'; card.style.top = Math.max(12, (H - card.offsetHeight) / 2) + 'px';
        return;
      }
      hole.className = 'hole';
      Object.assign(hole.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + 2 * pad) + 'px', height: (r.height + 2 * pad) + 'px' });
      const cw = card.offsetWidth, ch = card.offsetHeight;
      let left, top;
      if (r.left > cw + 40) { left = r.left - cw - 24; top = Math.min(Math.max(12, r.top), H - ch - 12); }       // left of target
      else if (W - r.right > cw + 40) { left = r.right + 24; top = Math.min(Math.max(12, r.top), H - ch - 12); } // right of target
      else if (H - r.bottom > ch + 30) { left = Math.min(Math.max(12, r.left), W - cw - 12); top = r.bottom + 20; } // below
      else { left = Math.min(Math.max(12, r.left), W - cw - 12); top = Math.max(12, r.top - ch - 20); }           // above
      card.style.left = left + 'px'; card.style.top = top + 'px';
    });
  }
  function dots() { const n = STEPS.length; return '<div class="dots">' + STEPS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('') + '</div>' + `<span class="n" style="margin-left:6px">${i + 1} / ${n}</span>`; }
  async function show(k) {
    if (cleanup) { cleanup(); cleanup = null; }
    i = Math.max(0, Math.min(STEPS.length - 1, k));
    const s = STEPS[i];
    if (s.final) return finish();
    card.innerHTML = `<div class="n">Step ${i + 1} of ${STEPS.length}</div><h3>${s.title}</h3>${s.html || `<p>${s.text}</p>`}<div class="wait" hidden></div>
      <div class="row">${dots()}<span class="sp"></span><button class="l" data-act="skip" type="button">Skip tour</button>${i ? '<button class="s" data-act="back" type="button">Back</button>' : ''}${s.noNext ? '' : `<button class="p" data-act="next" type="button">${s.next || 'Next'}</button>`}</div>`;
    card.dataset.step = s.id;
    card.querySelector('[data-act="skip"]').onclick = () => end(false);
    const back = card.querySelector('[data-act="back"]'); if (back) back.onclick = () => show(i - 1);
    const next = card.querySelector('[data-act="next"]');
    if (next) next.onclick = () => onNext(s);
    if (s.before) { try { await s.before(); } catch (_) { /* keep going */ } }
    place();
    if (s.wait && next) {
      const w = card.querySelector('.wait');
      next.disabled = true; w.hidden = false; w.textContent = s.waitText || 'One moment…';
      let alive = true; cleanup = () => { alive = false; };
      (async () => { for (let t = 0; alive && t < 600 && !s.wait(); t++) { await sleep(100); place(); } if (alive) { next.disabled = false; w.hidden = true; place(); } })();
    }
    if (s.id === 'submit') {
      const onDone = () => { setTimeout(() => show(i + 1), 900); };
      window.addEventListener('jaa-practice-confirmed', onDone, { once: true });
      cleanup = () => window.removeEventListener('jaa-practice-confirmed', onDone);
    }
  }
  async function onNext(s) {
    if (s.id === 'fill') { if (!(JAA.chat && JAA.chat.hasRun())) JAA.chat.onButton(); await sleep(300); }
    show(i + 1);
  }
  async function finish() {
    hole.className = 'hole none'; card.hidden = true;
    try { await chrome.storage.local.set({ tour: { done: true, at: Date.now() } }); } catch (_) { /* ignore */ }
    const { onboarding, profile } = await chrome.storage.local.get(['onboarding', 'profile']).catch(() => ({}));
    const setUp = !!(onboarding && onboarding.done) || !!(profile && (profile.firstName || profile.email));
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="mbox" role="dialog" aria-label="You're ready"><div class="big">🎉</div><h2>You're ready 🎉</h2>
      <p>That's the whole loop:</p><ul><li>Open a job → check your match</li><li>Fill → answer what's left in the chat</li><li>Review → press Submit yourself</li><li>It's tracked automatically</li></ul>
      <div class="row">${setUp ? '' : '<button class="p" data-act="setup" type="button">Set up my profile</button>'}<button class="${setUp ? 'p' : 's'}" data-act="close" type="button">${setUp ? 'Start applying' : 'Close'}</button></div></div>`;
    root.appendChild(m);
    m.querySelector('[data-act="close"]').onclick = () => end(true);
    const su = m.querySelector('[data-act="setup"]');
    if (su) su.onclick = () => { chrome.runtime.sendMessage({ type: 'onboarding:open' }, () => { void chrome.runtime.lastError; }); end(true); };
  }
  function end(done) {
    if (cleanup) { cleanup(); cleanup = null; }
    window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true);
    if (host) host.remove();
    if (!done) chrome.storage.local.set({ tour: { done: false, skippedAt: Date.now() } }).catch(() => {});
  }
  document.getElementById('tourRestart').onclick = () => { if (host) host.remove(); build(); show(0); };
  JAA.tour = { show: k => show(k), steps: STEPS, current: () => STEPS[i] && STEPS[i].id, end };
  // wait for the assistant button (it appears once the form is detected)
  (async () => {
    for (let t = 0; t < 100 && !jaa('.btn'); t++) await sleep(100);
    build(); show(0);
  })();
})();
