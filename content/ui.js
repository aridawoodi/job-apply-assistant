/* Floating "Fill application" button + chat-style assistant panel + toasts, isolated in
 * shadow roots so the job site's CSS can't touch them (and ours can't touch the site).
 * Conversation logic lives in content/chat.js; this file only draws. */
(function () {
  'use strict';
  if (window.__JAA_UI__) return;
  window.__JAA_UI__ = true;
  const JAA = window.JAA = window.JAA || {};
  let host, root, btn, panel, msgs, composer, input, countEl, stepEl, titleEl, subEl, busyEl;
  let prefs = { w: 390, h: 560, min: false };
  let interacted = false;
  let currentTab = 'assistant';

  const ICON = `<svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true"><defs><linearGradient id="jaag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#a78bfa"/></linearGradient></defs><rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="url(#jaag)"/><path d="M12 8h8a2 2 0 0 1 2 2v2h-2.5v-1.5h-7V12H10v-2a2 2 0 0 1 2-2z" fill="#e0e7ff"/><rect x="5" y="11.5" width="22" height="14" rx="3" fill="#fff"/><circle cx="23.5" cy="23.5" r="6.5" fill="#10b981" stroke="#fff" stroke-width="1.6"/><path d="M20.6 23.6l2 2 3.8-4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const GEAR = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7zm7.4-2.5a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1c.5.4 1.1.7 1.7 1l.4 2.5h4l.4-2.5c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.6z"/></svg>';

  const CSS = `
    :host{all:initial}
    *{box-sizing:border-box}
    .wrap{position:fixed;right:20px;bottom:20px;z-index:2147483647;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a}
    .btn{position:relative;display:flex;align-items:center;gap:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;border:0;border-radius:999px;
      padding:13px 22px 13px 14px;font:700 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;letter-spacing:.1px;cursor:pointer;
      box-shadow:0 10px 28px rgba(79,70,229,.38),0 2px 6px rgba(15,23,42,.18);transition:transform .15s,box-shadow .15s}
    .btn:hover{transform:translateY(-1px);box-shadow:0 14px 32px rgba(79,70,229,.45),0 2px 6px rgba(15,23,42,.2)}
    .btn:focus-visible{outline:3px solid #c7d2fe;outline-offset:2px}
    .btn .ic{display:flex;background:rgba(255,255,255,.14);border-radius:10px;padding:2px}
    .btn .count{position:absolute;top:-7px;right:-7px;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:#f59e0b;color:#1f1300;
      font:800 12px/24px inherit;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}
    .btn .count[hidden]{display:none}
    .btn.pulse{animation:jaapulse 1.8s ease-out 4}
    @keyframes jaapulse{0%{box-shadow:0 0 0 0 rgba(124,58,237,.55),0 10px 28px rgba(79,70,229,.38)}70%{box-shadow:0 0 0 16px rgba(124,58,237,0),0 10px 28px rgba(79,70,229,.38)}100%{box-shadow:0 0 0 0 rgba(124,58,237,0),0 10px 28px rgba(79,70,229,.38)}}
    @media (prefers-reduced-motion: reduce){.btn.pulse{animation:none;outline:3px solid #fbbf24;outline-offset:2px}.btn{transition:none}.dot{animation:none!important}}
    .panel{position:absolute;right:0;bottom:66px;display:none;flex-direction:column;background:#fff;border:1px solid #e2e8f0;border-radius:16px;
      box-shadow:0 24px 60px rgba(15,23,42,.28);overflow:hidden;max-width:calc(100vw - 40px);max-height:calc(100vh - 110px)}
    .panel.open{display:flex}
    .panel.min .body,.panel.min .composer,.panel.min .grip{display:none}
    .head{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;cursor:default;flex:none}
    .head .ic{display:flex}
    .head .tt{flex:1;min-width:0}
    .head .t1{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .head .t2{font-size:11.5px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .hb{border:0;background:rgba(255,255,255,.16);color:#fff;border-radius:8px;height:28px;min-width:28px;padding:0 8px;cursor:pointer;font:600 12px/28px inherit;display:inline-flex;align-items:center;justify-content:center;gap:4px}
    .hb:hover{background:rgba(255,255,255,.28)}
    .step{flex:none;background:#eef2ff;border-bottom:1px solid #e0e7ff;padding:6px 12px;font-size:12px;color:#3730a3;display:flex;align-items:center;gap:8px}
    .step[hidden]{display:none}
    .step .bar{flex:1;height:6px;background:#e0e7ff;border-radius:99px;overflow:hidden}.step .bar i{display:block;height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:99px}
    .body{flex:1;overflow:auto;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth}
    .msg{max-width:92%;padding:9px 11px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;box-shadow:0 1px 2px rgba(15,23,42,.06)}
    .msg.bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0;border-bottom-left-radius:4px}
    .msg.me{align-self:flex-end;background:#4f46e5;color:#fff;border-bottom-right-radius:4px}
    .msg.sys{align-self:center;background:transparent;box-shadow:none;color:#64748b;font-size:11.5px;padding:2px 6px;text-align:center}
    .msg.old{opacity:.6}
    .msg.card{width:92%;white-space:normal}
    .msg .lbl{font-weight:700;margin-bottom:3px}
    .msg .why{color:#64748b;font-size:11.5px;margin:2px 0 6px}
    .msg .kick{font-size:11px;color:#6366f1;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
    .draft{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:8px;white-space:pre-wrap;max-height:180px;overflow:auto;margin:6px 0;color:#1e3a8a}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    .chip{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:999px;padding:5px 10px;font:600 12px/1.2 inherit;cursor:pointer;text-align:left}
    .chip:hover{background:#e0e7ff}.chip.pri{background:#4f46e5;border-color:#4f46e5;color:#fff}.chip.pri:hover{background:#4338ca}
    .chip.ghost{background:#fff;border-color:#e2e8f0;color:#475569}.chip.warn{background:#fffbeb;border-color:#fde68a;color:#92400e}
    .chip[disabled]{opacity:.5;cursor:default}
    .ans{display:flex;gap:6px;margin-top:6px}.ans textarea,.ans input{flex:1;font:13px/1.4 inherit;border:1px solid #cbd5e1;border-radius:10px;padding:7px 9px;resize:vertical;min-height:34px;color:#0f172a;background:#fff}
    .stats{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
    .pill{border-radius:999px;padding:2px 8px;font-size:12px;font-weight:600}
    .ok{background:#dcfce7;color:#166534}.ai{background:#dbeafe;color:#1e40af}.todo{background:#fef9c3;color:#854d0e}.you{background:#ccfbf1;color:#115e59}.kept{background:#f1f5f9;color:#334155}.bad{background:#fee2e2;color:#991b1b}
    .err{background:#fee2e2;color:#991b1b;border-radius:8px;padding:8px;white-space:pre-wrap;margin:6px 0;font-size:12px}
    .prog{background:#eef2ff;color:#3730a3;border-radius:8px;padding:6px 8px;margin:6px 0;font-size:12px;display:flex;align-items:center;gap:6px}
    .dot{width:8px;height:8px;border-radius:50%;background:#6366f1;animation:jaadot 1s infinite alternate}@keyframes jaadot{from{opacity:.3}to{opacity:1}}
    .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;font-size:12px}
    .row label{display:flex;align-items:center;gap:4px;cursor:pointer}
    table.rv{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0}
    table.rv td{border-top:1px solid #f1f5f9;padding:5px 4px;vertical-align:top}
    table.rv td.v{color:#334155;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    table.rv td.s{white-space:nowrap}
    .rvh{font-weight:700;font-size:12px;margin:8px 0 2px;color:#334155}
    .jump{border:0;background:none;color:#4f46e5;cursor:pointer;font:600 12px inherit;padding:0 2px}
    ul.ck{list-style:none;padding:0;margin:6px 0}ul.ck li{margin:3px 0}
    .composer{flex:none;display:flex;gap:6px;padding:8px;border-top:1px solid #e2e8f0;background:#fff}
    .composer textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:8px 10px;font:13px/1.4 inherit;max-height:110px;min-height:36px;color:#0f172a}
    .composer textarea:focus,.ans textarea:focus,.ans input:focus{outline:2px solid #c7d2fe;border-color:#818cf8}
    .send{border:0;border-radius:12px;background:#4f46e5;color:#fff;font:700 13px/1 inherit;padding:0 14px;cursor:pointer}
    .send[disabled]{opacity:.5}
    .grip{position:absolute;left:0;top:0;width:18px;height:18px;cursor:nwse-resize;z-index:2}
    .grip::after{content:"";position:absolute;left:4px;top:4px;width:8px;height:8px;border-left:2px solid rgba(255,255,255,.75);border-top:2px solid rgba(255,255,255,.75);border-top-left-radius:3px}
    .busy{font-size:11px;opacity:.9}
    a{color:#4f46e5}
    .tabs{flex:none;display:flex;gap:2px;padding:4px 6px 0;background:#fff;border-bottom:1px solid #e2e8f0}
    .tab{flex:1;border:0;background:none;padding:7px 2px 8px;font:600 12px/1 inherit;color:#64748b;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
    .tab:hover{color:#3730a3}.tab.on{color:#4338ca;border-bottom-color:#6366f1}
    .tab .tc{display:inline-block;min-width:16px;height:16px;padding:0 4px;margin-left:3px;border-radius:99px;background:#fef3c7;color:#92400e;font:700 10px/16px inherit}
    .tab .tc:empty{display:none}
    .views{flex:1;min-height:0;display:flex;flex-direction:column}
    .view{flex:1;min-height:0;display:none;flex-direction:column}.view.on{display:flex}
    .pbody{flex:1;overflow:auto;padding:12px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}
    .panel.min .tabs,.panel.min .views{display:none}
    .sec{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px}
    .sec h4{margin:0 0 6px;font-size:12.5px;color:#334155;display:flex;align-items:center;gap:6px}
    .sec .muted,.muted{color:#64748b;font-size:12px}
    .jc{display:flex;gap:10px;align-items:flex-start;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:10px;margin:0}
    .jc .fav{width:34px;height:34px;border-radius:9px;flex:none;background:#eef2ff;color:#4338ca;display:flex;align-items:center;justify-content:center;font:800 15px/1 inherit;overflow:hidden}
    .jc .fav img{width:22px;height:22px}
    .jc .jt{font-weight:700;font-size:13.5px;line-height:1.3}.jc .jco{color:#475569;font-size:12px}
    .jc .meta{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}.jc .meta span{background:#f1f5f9;color:#334155;border-radius:99px;padding:2px 8px;font-size:11px}
    .jc .bm{margin-left:auto;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:4px 8px;cursor:pointer;font:600 12px/1.2 inherit;color:#4338ca;white-space:nowrap}
    .jc .bm.on{background:#fef3c7;border-color:#fde68a;color:#92400e}
    .priv{display:flex;gap:8px;align-items:center;background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:12px;padding:8px 10px;font-size:12px}
    .priv b{display:block;font-size:12.5px}.priv a{color:#047857;font-weight:600;cursor:pointer}
    .priv.mini{background:none;border:0;padding:0 2px;justify-content:center;color:#64748b;font-size:11px}.priv.mini a{color:#64748b}
    .btnp{border:0;border-radius:10px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff;font:700 13px/1 inherit;padding:10px 14px;cursor:pointer;width:100%}
    .btnp:hover{filter:brightness(1.07)}.btnp[disabled]{opacity:.55;cursor:default}
    .btns{border:1px solid #c7d2fe;border-radius:10px;background:#eef2ff;color:#3730a3;font:600 12.5px/1 inherit;padding:8px 12px;cursor:pointer}
    .copyl{list-style:none;margin:0;padding:0}.copyl li{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #f1f5f9}.copyl li:first-child{border-top:0}
    .copyl .k{color:#64748b;font-size:11.5px;width:88px;flex:none}.copyl .v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
    .cp{border:1px solid #e2e8f0;background:#fff;border-radius:7px;padding:3px 7px;font:600 11px/1.2 inherit;color:#4338ca;cursor:pointer;flex:none}.cp:hover{background:#eef2ff}.cp.done{background:#dcfce7;color:#166534;border-color:#bbf7d0}
    .ring{--p:0;width:74px;height:74px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;background:conic-gradient(var(--c,#6366f1) calc(var(--p)*1%),#e2e8f0 0)}
    .ring b{width:58px;height:58px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font:800 18px/1 inherit;color:#1e1b4b}
    .kw{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.kw span{border-radius:99px;padding:2px 8px;font-size:11px;background:#dcfce7;color:#166534}.kw span.miss{background:#fee2e2;color:#991b1b}
    .diag{list-style:none;padding:0;margin:0}.diag li{padding:3px 0;font-size:12px}
    select.sel,textarea.ta,input.in{width:100%;font:13px/1.4 inherit;border:1px solid #cbd5e1;border-radius:9px;padding:7px 9px;color:#0f172a;background:#fff}
    textarea.ta{min-height:80px;resize:vertical}
    pre.prev{white-space:pre-wrap;background:#f1f5f9;border-radius:8px;padding:8px;font:11.5px/1.4 ui-monospace,Menlo,Consolas,monospace;max-height:180px;overflow:auto;margin:6px 0}
    .stepper{display:flex;gap:3px;margin:6px 0}.stepper button{flex:1;border:1px solid #e2e8f0;background:#fff;border-radius:6px;padding:4px 0;font:600 10.5px/1.2 inherit;color:#64748b;cursor:pointer}
    .stepper button.past{background:#eef2ff;color:#4338ca;border-color:#c7d2fe}.stepper button.cur{background:#4f46e5;color:#fff;border-color:#4f46e5}.stepper button.rej.cur{background:#dc2626;border-color:#dc2626}
    .trow{border-top:1px solid #f1f5f9;padding:7px 0}.trow:first-child{border-top:0}.trow .t1{font-weight:700;font-size:12.5px}.trow .t2{color:#64748b;font-size:11.5px}
    .scan{display:flex;gap:6px;align-items:center;font-size:12px;color:#334155;margin:4px 0}
    ul.fl-list{list-style:none;margin:4px 0;padding:0;max-height:220px;overflow:auto}
    .fr{display:flex;align-items:center;gap:6px;padding:2px 0;font-size:12px}
    .fr.live{animation:jaain .25s ease-out}@keyframes jaain{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
    .fi{width:16px;height:16px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font:800 10px/1 inherit}
    .fi.ok,.fi.kept{background:#dcfce7;color:#166534}.fi.ai{background:#dbeafe;color:#1d4ed8}.fi.you{background:#ccfbf1;color:#115e59}.fi.todo{background:#fef9c3;color:#854d0e}.fi.wait{background:#f1f5f9;color:#64748b}
    .fl{border:0;background:none;padding:0;color:#0f172a;cursor:pointer;font:12px/1.3 inherit;text-align:left;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fl:hover{color:#4338ca;text-decoration:underline}
    .fn{color:#64748b;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:45%}
    details.cl{border:1px solid #e2e8f0;border-radius:10px;padding:6px 8px;margin:6px 0;background:#fff}
    details.cl summary{cursor:pointer;display:flex;align-items:center;gap:8px;font-weight:700;font-size:12px;list-style:none}
    details.cl summary::-webkit-details-marker{display:none}details.cl summary::before{content:'▸';color:#6366f1}details.cl[open] summary::before{content:'▾'}
    .clbar{flex:1;height:5px;border-radius:99px;background:#e2e8f0;overflow:hidden}.clbar i{display:block;height:100%;background:#22c55e}
    @media (prefers-reduced-motion: reduce){.fr.live{animation:none}}
  `;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }

  function loadPrefs() {
    try { chrome.storage.local.get('uiPrefs', r => { void chrome.runtime.lastError; if (r && r.uiPrefs) { prefs = Object.assign(prefs, r.uiPrefs); applySize(); } }); } catch (_) { /* ignore */ }
  }
  function savePrefs() { try { chrome.storage.local.set({ uiPrefs: prefs }); } catch (_) { /* ignore */ } }
  function applySize() {
    if (!panel) return;
    const W = Math.min(Math.max(prefs.w, 300), Math.max(320, window.innerWidth - 40));
    const H = Math.min(Math.max(prefs.h, 280), Math.max(300, window.innerHeight - 110));
    panel.style.width = W + 'px';
    panel.style.height = prefs.min ? 'auto' : H + 'px';
    panel.classList.toggle('min', !!prefs.min);
  }

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.id = 'jaa-host';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="wrap">
      <div class="panel" role="dialog" aria-label="AI Job Application Assistant">
        <div class="grip" title="Drag to resize"></div>
        <div class="head"><span class="ic">${ICON}</span><div class="tt"><div class="t1">AI Job Application Assistant</div><div class="t2"></div></div>
          <span class="busy"></span>
          <button class="hb" data-h="review" type="button" title="Review every field before you submit">Review</button>
          <button class="hb" data-h="settings" type="button" title="Settings">${GEAR}</button>
          <button class="hb" data-h="min" type="button" title="Minimize">–</button>
          <button class="hb x" data-h="close" type="button" title="Close">×</button></div>
        <div class="tabs" role="tablist">
          <button class="tab on" data-tab="assistant" role="tab" type="button">Assistant<span class="tc"></span></button>
          <button class="tab" data-tab="resume" role="tab" type="button">Resume</button>
          <button class="tab" data-tab="profile" role="tab" type="button">Profile</button>
          <button class="tab" data-tab="tracker" role="tab" type="button">Tracker</button>
          <button class="tab" data-tab="report" role="tab" type="button">Report</button>
        </div>
        <div class="views">
          <div class="view on" data-view="assistant">
            <div class="step" hidden><span class="st"></span><span class="bar"><i></i></span></div>
            <div class="body" aria-live="polite"></div>
            <div class="composer"><textarea rows="1" placeholder="Ask me anything, e.g. &quot;what's left?&quot; or &quot;make the why-us answer more technical&quot;"></textarea><button class="send" type="button">Send</button></div>
          </div>
          <div class="view" data-view="resume"><div class="pbody"></div></div>
          <div class="view" data-view="profile"><div class="pbody"></div></div>
          <div class="view" data-view="tracker"><div class="pbody"></div></div>
          <div class="view" data-view="report"><div class="pbody"></div></div>
        </div>
      </div>
      <button class="btn" type="button" title="Fill this application with your saved profile and chat with the assistant (you still press Submit)"><span class="ic">${ICON}</span><span class="lb">⚡ Fill application</span><span class="count" hidden></span></button>
    </div>`;
    btn = root.querySelector('.btn');
    panel = root.querySelector('.panel');
    msgs = root.querySelector('.body');
    composer = root.querySelector('.composer');
    input = composer.querySelector('textarea');
    countEl = root.querySelector('.count');
    stepEl = root.querySelector('.step');
    titleEl = root.querySelector('.t1');
    subEl = root.querySelector('.t2');
    busyEl = root.querySelector('.busy');
    btn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      interacted = true; btn.classList.remove('pulse');
      if (JAA.chat) JAA.chat.onButton(); else if (JAA.run) JAA.run({ source: 'button' });
    });
    root.querySelectorAll('.tab').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); JAA.ui.tab(b.dataset.tab); }));
    root.querySelectorAll('[data-h]').forEach(b => b.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const a = b.dataset.h;
      if (a === 'close') { panel.classList.remove('open'); return; }
      if (a === 'min') { prefs.min = !prefs.min; applySize(); savePrefs(); return; }
      if (JAA.chat) JAA.chat.onHeader(a);
    }));
    const send = () => { const v = input.value.trim(); if (!v) return; input.value = ''; autoGrow(); if (JAA.chat) JAA.chat.onUserText(v); };
    composer.querySelector('.send').addEventListener('click', send);
    const autoGrow = () => { input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; };
    input.addEventListener('input', autoGrow);
    // keep keystrokes inside the panel (job sites have their own shortcuts)
    panel.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.target === input && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    });
    ['keyup', 'keypress'].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));
    // resize from the top-left corner (the panel is anchored bottom-right)
    const grip = root.querySelector('.grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY, w0 = panel.offsetWidth, h0 = panel.offsetHeight;
      grip.setPointerCapture(e.pointerId);
      const mv = ev => { prefs.w = w0 + (x0 - ev.clientX); prefs.h = h0 + (y0 - ev.clientY); applySize(); };
      const up = () => { grip.removeEventListener('pointermove', mv); grip.removeEventListener('pointerup', up); savePrefs(); };
      grip.addEventListener('pointermove', mv); grip.addEventListener('pointerup', up);
    });
    applySize(); loadPrefs();
    (document.body || document.documentElement).appendChild(host);
  }

  function scrollDown() { if (msgs) requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; }); }

  let toastHost, toastRoot, toastTimer;
  function toast(text, kind, sub) {
    if (!toastHost || !toastHost.isConnected) {
      toastHost = document.createElement('div');
      toastHost.id = 'jaa-toast-host';
      toastRoot = toastHost.attachShadow({ mode: 'open' });
      toastRoot.innerHTML = `<style>
        :host{all:initial}
        .t{position:fixed;top:16px;right:16px;z-index:2147483647;max-width:380px;padding:11px 14px;border-radius:12px;
           font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;background:#312e81;
           box-shadow:0 10px 28px rgba(0,0,0,.25);opacity:0;transform:translateY(-6px);transition:opacity .2s,transform .2s;pointer-events:none}
        .t.show{opacity:1;transform:none}.ok{background:#15803d}.err{background:#b91c1c}.info{background:#4338ca}.warn{background:#b45309}
        @media (prefers-reduced-motion: reduce){.t{transition:none}}
        small{display:block;font-weight:400;opacity:.88;margin-top:2px}</style><div class="t" role="status"></div>`;
      (document.body || document.documentElement).appendChild(toastHost);
    }
    const el = toastRoot.querySelector('.t');
    el.className = 't ' + (kind || '');
    el.textContent = text;
    const sm = document.createElement('small'); sm.textContent = sub || 'AI Job Application Assistant · tracker updated'; el.appendChild(sm);
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'err' || kind === 'warn' ? 9000 : 6000);
  }

  JAA.ui = {
    h, toast, ICON,
    showButton(show) {
      if (!show) { if (host) host.remove(); return; }
      const fresh = !(host && host.isConnected);
      ensure();
      if (fresh && !interacted) btn.classList.add('pulse'); // gentle hint on first appearance
    },
    isShown() { return !!(host && host.isConnected); },
    busy(text) {
      ensure();
      btn.querySelector('.lb').textContent = text || (JAA.chat && JAA.chat.hasRun() ? '⚡ Assistant' : '⚡ Fill application');
      busyEl.textContent = text || '';
    },
    setCount(n) {
      ensure();
      countEl.hidden = !n;
      countEl.textContent = n > 99 ? '99+' : String(n || '');
      btn.title = n ? `${n} field${n > 1 ? 's' : ''} still need your attention. Click to open the assistant.` : 'Open the assistant';
      if (n && !interacted && !panel.classList.contains('open')) btn.classList.add('pulse');
      if (!n) btn.classList.remove('pulse');
    },
    interacted() { interacted = true; if (btn) btn.classList.remove('pulse'); },
    open() { ensure(); panel.classList.add('open'); if (prefs.min) { prefs.min = false; applySize(); } scrollDown(); },
    close() { if (panel) panel.classList.remove('open'); },
    isOpen() { return !!(panel && panel.classList.contains('open')); },
    header(title, sub) { ensure(); titleEl.textContent = title || 'AI Job Application Assistant'; subEl.textContent = sub || ''; },
    setStep(st) {
      ensure();
      if (!st || (!st.total && st.pct == null && !st.n)) { stepEl.hidden = true; return; }
      stepEl.hidden = false;
      const pct = st.total ? Math.round(100 * st.n / st.total) : (st.pct != null ? st.pct : 0);
      stepEl.querySelector('.st').textContent = (st.total ? `Step ${st.n} of ${st.total}` : (st.n ? `Step ${st.n}` : `${pct}% done`)) + (st.label ? ` · ${st.label}` : '');
      stepEl.querySelector('.bar i').style.width = Math.max(4, Math.min(100, pct)) + '%';
    },
    add(role, content, cls) {
      ensure();
      const m = h('div', { class: 'msg ' + role + (cls ? ' ' + cls : '') });
      if (content instanceof Node) m.appendChild(content); else if (Array.isArray(content)) content.forEach(c => c && m.appendChild(typeof c === 'string' ? document.createTextNode(c) : c)); else m.textContent = String(content == null ? '' : content);
      msgs.appendChild(m);
      scrollDown();
      return m;
    },
    clearMessages() { ensure(); msgs.innerHTML = ''; },
    // panel tabs: Assistant (chat + fill), Resume (match + tailor + cover letter), Profile, Tracker, Report
    tab(name) {
      ensure();
      if (!root.querySelector(`[data-view="${name}"]`)) name = 'assistant';
      root.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
      root.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.dataset.view === name));
      if (prefs.min) { prefs.min = false; applySize(); }
      currentTab = name;
      if (name !== 'assistant' && JAA.panel) JAA.panel.render(name, root.querySelector(`[data-view="${name}"] .pbody`));
      if (name === 'assistant') scrollDown();
    },
    currentTab: () => currentTab,
    view: name => { ensure(); return root.querySelector(`[data-view="${name}"] .pbody`); },
    tabCount(name, n) { ensure(); const t = root.querySelector(`[data-tab="${name}"] .tc`); if (t) t.textContent = n ? String(n) : ''; },
    // a fixed slot above the chat messages (job card + privacy card)
    topSlot() { ensure(); let s = msgs.querySelector('.top-slot'); if (!s) { s = h('div', { class: 'top-slot', style: 'display:flex;flex-direction:column;gap:8px' }); msgs.prepend(s); } return s; },
    scrollDown,
    focusInput() { try { input.focus(); } catch (_) { /* ignore */ } },
    root: () => root,
    // compatibility with v0.2 callers (main.js): routed into the chat
    message(title, body, isError) {
      ensure();
      JAA.ui.open();
      JAA.ui.add('bot', [h('div', { class: 'lbl', text: title }), isError ? h('div', { class: 'err', text: body }) : h('div', { text: body })], 'card');
    },
    summary(s, fields) { if (JAA.chat) JAA.chat.onSummary(s, fields); }
  };
})();
