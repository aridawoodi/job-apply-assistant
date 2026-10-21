/* Runs in the page's MAIN world (manifest "world": "MAIN") so it can see the site's own
 * fetch/XHR calls. It only OBSERVES: it reports POSTs that look like an application
 * submit (URL + HTTP status) to content/track.js via window.postMessage. It never
 * changes, blocks or sends requests. */
(function () {
  'use strict';
  if (window.__JAA_NETWATCH__) return;
  window.__JAA_NETWATCH__ = true;
  const SKIP = /(parse|resume|upload|presign|s3\.|amazonaws|analytics|track|telemetry|log(ging)?\b|sentry|recaptcha|hcaptcha|captcha|autofill|validate|draft|csp|beacon|metrics|segment|datadog|hotjar|google|stripe)/i;
  const APPLY = /(\/applications?\b|\/apply\b|submit|job_app|applicationform|ApiSubmit)/i;
  function interesting(url) {
    try {
      const u = new URL(url, location.href);
      if (SKIP.test(u.href)) return false;
      // Remix/Next style: the form action POSTs back to the job page itself
      const samePage = u.origin === location.origin && u.pathname.replace(/\/+$/, '') === location.pathname.replace(/\/+$/, '');
      return APPLY.test(u.pathname + u.search) || samePage;
    } catch (_) { return false; }
  }
  const report = (url, status) => {
    try { window.postMessage({ __jaa: 'net', url: String(url), status: status }, location.origin === 'null' ? '*' : location.origin); } catch (_) { /* ignore */ }
  };
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const p = origFetch.apply(this, arguments);
      if (method === 'POST' && interesting(url)) {
        p.then(r => report(url, r.status), () => report(url, 0));
      }
      return p;
    };
  }
  const X = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (X) {
    const open = X.open, send = X.send;
    X.open = function (method, url) { this.__jaa = { method: String(method || '').toUpperCase(), url }; return open.apply(this, arguments); };
    X.send = function () {
      const m = this.__jaa;
      if (m && m.method === 'POST' && interesting(m.url)) this.addEventListener('loadend', () => report(m.url, this.status));
      return send.apply(this, arguments);
    };
  }
})();
