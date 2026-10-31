// v0.6.7 unit tests: setup checklist state (lib/activation.js). Pure functions, no browser.
const A = require('../lib/activation.js');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };

console.log('\nnormalize');
const z = A.normalize(undefined);
check(JSON.stringify(z) === JSON.stringify({ profileAt: 0, aiAt: 0, practiceAt: 0, realAt: 0, dismissedAt: 0 }), 'empty state: all steps open');
check(A.normalize({ profileAt: 'x', aiAt: -5, realAt: NaN, junk: 1 }).profileAt === 0 && !('junk' in A.normalize({ junk: 1 })), 'bad values and unknown keys dropped');

console.log('\nmark keeps the first time');
let s = A.mark({}, 'profile', 1000);
check(s.profileAt === 1000, 'profile marked');
check(A.mark(s, 'profile', 5000).profileAt === 1000, 'marking again keeps the first timestamp');
check(A.same(A.mark(s, 'nope', 1), s), 'unknown step changes nothing');
check(A.mark({}, 'ai').aiAt > 0, 'default timestamp = now');

console.log('\nview: progress, next step, practice implied by a real fill');
let v = A.view({});
check(v.done === 0 && v.total === 4 && v.pct === 0 && v.next === 'profile' && v.show && !v.complete && !v.compact, 'fresh: 0/4, next = import your resume');
check(v.steps.map(x => x.id).join() === 'profile,ai,practice,real', 'four steps in order');
v = A.view({ profileAt: 1, practiceAt: 2 });
check(v.done === 2 && v.pct === 50 && v.next === 'ai', 'profile + practice: 2/4, 50%, next = AI helper');
v = A.view({ profileAt: 1, realAt: 3 });
check(v.done === 3 && v.steps.find(x => x.id === 'practice').done && v.compact, 'a real fill counts as practice too; popup goes compact (one line)');
v = A.view({ profileAt: 1, aiAt: 1, practiceAt: 1, realAt: 1 });
check(v.complete && v.pct === 100 && v.next === null && !v.compact && v.show, 'all done: 100%, still shown until dismissed');

console.log('\nreconcile from facts measured now');
s = A.reconcile({}, { hasProfile: true, aiReady: false }, 10);
check(s.profileAt === 10 && !s.aiAt, 'profile present -> stamped; AI not ready -> open');
s = A.reconcile(s, { hasProfile: false, aiReady: true }, 20);
check(s.profileAt === 10 && s.aiAt === 20, 'a step once done stays done (profile cleared later does not un-tick); AI stamped');

console.log('\ndismiss only when complete');
check(!A.dismiss({ profileAt: 1 }, 9).dismissedAt, 'cannot hide an unfinished checklist (no hide-and-forget, no nag either)');
const d = A.dismiss({ profileAt: 1, aiAt: 1, practiceAt: 1, realAt: 1 }, 9);
check(d.dismissedAt === 9 && A.view(d).show === false && A.view(d).dismissed, 'complete + dismissed: hidden for good');
check(A.same({ profileAt: 1 }, { profileAt: 1, junk: 2 }) && !A.same({ profileAt: 1 }, { profileAt: 2 }), 'same() compares normalized state (writes only on change)');

console.log('\nprivacy: state is timestamps only');
check(Object.keys(A.normalize({ profileAt: 1, email: 'a@example.com' })).every(k => /At$/.test(k)), 'no personal data can be stored in the checklist state');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
