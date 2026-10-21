/* Small helpers for the extension's own pages. */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // only ever used with static strings
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
  }
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || null); }); } catch (_) { res(null); } });
  // long task over a port (model download, resume extraction, tailoring)
  function task(payload, onProgress) {
    let port;
    const p = new Promise((resolve, reject) => {
      port = chrome.runtime.connect({ name: 'jaa-task' });
      port.onMessage.addListener(m => {
        if (m.type === 'done') { resolve(m); port.disconnect(); }
        else if (m.type === 'error') { reject(Object.assign(new Error(m.error), { raw: m.raw })); port.disconnect(); }
        else if (onProgress) onProgress(m);
      });
      port.onDisconnect.addListener(() => { void chrome.runtime.lastError; reject(new Error('Cancelled.')); });
      port.postMessage(payload);
    });
    p.cancel = () => { try { port.disconnect(); } catch (_) { /* gone */ } };
    return p;
  }
  const abToDataUrl = (ab, mime) => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(new Blob([ab], { type: mime })); });
  async function dataUrlToAb(u) { return (await fetch(u)).arrayBuffer(); }
  function download(name, blobOrUrl) {
    const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
    const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove();
    if (typeof blobOrUrl !== 'string') setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function os() {
    const p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '').toLowerCase();
    return /mac/.test(p) ? 'mac' : /win/.test(p) ? 'win' : /linux|x11|cros/.test(p) ? 'linux' : 'other';
  }
  const fmtBytes = n => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round(n / 1e3) + ' KB');
  JAA.page = { h, send, task, abToDataUrl, dataUrlToAb, download, os, fmtBytes };
})(self);
