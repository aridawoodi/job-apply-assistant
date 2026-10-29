/* Optional Chrome Web Store rating prompt (v0.6.4): pure logic, no chrome.* calls, so it can be unit-tested
 * in Node (dev-tests/unit-rating.js). The background worker owns the stored state; the popup only shows a
 * small card when eligible() says so. Policy notes: everyone who sees the card gets the same "Rate it" button
 * (no happy/unhappy routing), nothing is offered in return, and "No thanks" or "Rate it" end it for good.
 * Stored in chrome.storage.local under `rating`: { installedAt (ms), count, status, nextAt }.
 * Only a number and a timestamp are kept: no job titles, companies or other personal data. */
(function (g) {
  'use strict';
  const MIN_COUNT = 3;                       // tracked applications before the first ask
  const MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000; // and installed for at least 3 days
  const LATER_GAP = 10;                      // "Maybe later" asks again after 10 more applications
  const STATUSES = ['none', 'later', 'rated', 'never'];
  const STORE_ID = 'ianfkblcpiejjcjammkdloflpjhodaen';
  const REVIEW_URL = 'https://chromewebstore.google.com/detail/' + STORE_ID + '/reviews';
  const FEEDBACK_URL = 'https://github.com/aridawoodi/job-apply-assistant/issues';
  // stages that can only be reached after the application went out
  const AFTER_APPLIED = ['screen', 'interview', 'offer', 'rejected'];

  const num = (v, d) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : d);

  // fill in / repair a stored state (missing keys, old shapes, bad values)
  function normalize(st, now) {
    const s = st && typeof st === 'object' ? st : {};
    return {
      installedAt: num(s.installedAt, 0) || num(now, Date.now()),
      count: num(s.count, 0),
      status: STATUSES.includes(s.status) ? s.status : 'none',
      nextAt: num(s.nextAt, MIN_COUNT)
    };
  }

  // should the popup show the card right now?
  function eligible(st, now) {
    if (!st || typeof st !== 'object') return false;
    const s = normalize(st, now);
    if (s.status === 'rated' || s.status === 'never') return false;
    if (s.count < MIN_COUNT) return false;
    if (num(now, Date.now()) - s.installedAt < MIN_AGE_MS) return false;
    return s.count >= s.nextAt;
  }

  // one more application went out
  function increment(st, now, by) {
    const s = normalize(st, now);
    s.count += num(by, 1);
    return s;
  }

  // a button on the card: 'rate' | 'later' | 'never'
  function act(st, action, now) {
    const s = normalize(st, now);
    if (action === 'rate') s.status = 'rated';
    else if (action === 'never') s.status = 'never';
    else if (action === 'later') { s.status = 'later'; s.nextAt = s.count + LATER_GAP; }
    return s;
  }

  // a tracker row counts once the application really went out: the site's confirmation was seen,
  // or the job moved past "applied" (screening, interview, offer, rejected). Saved / filled-only rows,
  // a Submit that came back with an error and bookmarks never count.
  function countsAsApplied(row) {
    if (!row || typeof row !== 'object') return false;
    if (row.confirmedAt) return true;
    return AFTER_APPLIED.includes(row.stage);
  }

  const api = { MIN_COUNT, MIN_AGE_MS, LATER_GAP, STATUSES, STORE_ID, REVIEW_URL, FEEDBACK_URL, normalize, eligible, increment, act, countsAsApplied };
  g.JAA_RATING = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
