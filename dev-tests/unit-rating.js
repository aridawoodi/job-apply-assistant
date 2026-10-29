// Node unit tests for the v0.6.4 optional rating prompt (lib/rating.js): when the popup card may show,
// what each button does, and which tracker rows count as an application that went out.
// Run: node dev-tests/unit-rating.js
const path = require('path');
const R = require(path.join(__dirname, '..', 'lib/rating.js'));
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1);
const st = o => Object.assign({ installedAt: T0, count: 0, status: 'none', nextAt: 3 }, o);

console.log('eligibility');
check(!R.eligible(null, T0 + 10 * DAY), 'no stored state: not eligible');
check(!R.eligible(st({ count: 2 }), T0 + 10 * DAY), '2 applications: not yet');
check(R.eligible(st({ count: 3 }), T0 + 10 * DAY), '3 applications, 10 days: eligible');
check(!R.eligible(st({ count: 3 }), T0 + 3 * DAY - 1), '3 applications but installed < 3 days: not yet');
check(R.eligible(st({ count: 3 }), T0 + 3 * DAY), 'exactly 3 days: eligible');
check(!R.eligible(st({ count: 50, status: 'rated' }), T0 + 99 * DAY), 'rated: never again');
check(!R.eligible(st({ count: 50, status: 'never' }), T0 + 99 * DAY), 'no thanks: never again');
check(!R.eligible(st({ count: 5, status: 'later', nextAt: 14 }), T0 + 99 * DAY), 'later: waits until nextAt');
check(R.eligible(st({ count: 14, status: 'later', nextAt: 14 }), T0 + 99 * DAY), 'later: asks again at nextAt');
check(!R.eligible(st({ count: 3, nextAt: 1 }), T0 + 1 * DAY), 'a low nextAt never bypasses the 3-day wait');
check(!R.eligible(st({ count: 2, nextAt: 0 }), T0 + 10 * DAY), 'a low nextAt never bypasses the 3-application minimum');

console.log('normalize');
const n = R.normalize({ count: -4, status: 'weird', nextAt: 'x' }, T0);
check(n.count === 0 && n.status === 'none' && n.nextAt === 3 && n.installedAt === T0, 'bad values repaired: ' + JSON.stringify(n));
check(R.normalize(undefined, T0).installedAt === T0, 'missing installedAt starts the clock now');
check(R.normalize({ installedAt: T0 - DAY }, T0).installedAt === T0 - DAY, 'existing installedAt kept');

console.log('buttons');
const s3 = st({ count: 3 });
const later = R.act(s3, 'later', T0);
check(later.status === 'later' && later.nextAt === 13, 'Maybe later: nextAt = count + 10 (' + later.nextAt + ')');
check(!R.eligible(later, T0 + 10 * DAY), 'after Maybe later: hidden');
let s = later; for (let i = 0; i < 10; i++) s = R.increment(s, T0);
check(s.count === 13 && R.eligible(s, T0 + 10 * DAY), '10 more applications later: shown again');
const rated = R.act(s3, 'rate', T0);
check(rated.status === 'rated' && !R.eligible(R.increment(rated, T0, 100), T0 + 99 * DAY), 'Rate it: never shown again');
const never = R.act(s3, 'never', T0);
check(never.status === 'never' && !R.eligible(R.increment(never, T0, 100), T0 + 99 * DAY), 'No thanks: never shown again');
check(R.act(s3, 'bogus', T0).status === 'none', 'unknown action changes nothing');
check(s3.count === 3 && s3.status === 'none', 'act/increment do not mutate the input');

console.log('counting');
check(R.increment(st({ count: 2 }), T0).count === 3, 'increment by 1');
check(R.increment(st({ count: 2 }), T0, 4).count === 6, 'increment by n (seeding existing tracker rows)');
check(R.countsAsApplied({ confirmedAt: '2026-10-01T00:00:00Z', stage: 'applied' }), 'confirmation seen: counts');
check(R.countsAsApplied({ stage: 'interview' }) && R.countsAsApplied({ stage: 'screen' }) && R.countsAsApplied({ stage: 'offer' }) && R.countsAsApplied({ stage: 'rejected' }), 'moved past Applied: counts');
check(!R.countsAsApplied({ stage: 'saved', bookmarked: true }), 'bookmark only: no');
check(!R.countsAsApplied({ stage: 'saved', firstFilled: 'x', status: 'Filled' }), 'filled but not sent: no');
check(!R.countsAsApplied({ stage: 'applied', submittedAt: 'x', status: 'Error - not sent' }), 'Submit with an error, no confirmation: no');
check(!R.countsAsApplied(null), 'null row: no');

console.log('policy');
check(R.REVIEW_URL === 'https://chromewebstore.google.com/detail/ianfkblcpiejjcjammkdloflpjhodaen/reviews', 'Rate it opens the store reviews page');
check(/^https:\/\/github\.com\/aridawoodi\/job-apply-assistant\/issues$/.test(R.FEEDBACK_URL), 'feedback goes to GitHub issues');
check(R.MIN_COUNT === 3 && R.MIN_AGE_MS === 3 * DAY && R.LATER_GAP === 10, 'thresholds: 3 applications, 3 days, +10 on later');

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
