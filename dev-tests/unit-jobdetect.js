// v0.6.7 unit tests: "does this page look like a job application?" scoring (lib/jobdetect.js score()).
// The DOM side (features()) is covered by e2e-anysite.js on real pages.
const D = require('../lib/jobdetect.js');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const s = f => D.score(f);

console.log('\njob applications pass');
const plain = s({ hasName: true, hasEmail: true, hasPhone: true, resumeFile: true, fillable: 12, keywords: ['apply', 'resume', 'cover', 'auth', 'eeo'], urlHint: true });
check(plain.ok && plain.score >= 12, 'full application (resume upload, contact, keywords, many fields): ' + plain.score);
const noResume = s({ hasName: true, hasEmail: true, hasPhone: true, fillable: 7, keywords: ['apply', 'auth', 'links'] });
check(noResume.ok, 'no upload, but contact fields + application questions: ' + noResume.score);
const short = s({ hasName: true, hasEmail: true, resumeFile: true, fillable: 4, keywords: ['resume'] });
check(short.ok, 'short form: name, email, resume upload: ' + short.score);
const embed = s({ hasName: true, hasEmail: true, hasPhone: true, resumeFile: true, fillable: 6, keywords: ['apply', 'resume'] });
check(embed.ok, 'embedded form (iframe content): ' + embed.score);

console.log('\nother forms stay quiet');
const contact = s({ hasName: true, hasEmail: true, hasPhone: true, fillable: 4, keywords: [], negative: 'contact us' });
check(!contact.ok && contact.score < D.THRESHOLD, 'contact form (name, email, phone, message): ' + contact.score);
const login = s({ hasEmail: true, password: true, fillable: 1, keywords: ['apply'] });
check(!login.ok, 'sign-in form on a careers site: ' + login.score);
const signupJobs = s({ hasName: true, hasEmail: true, password: true, fillable: 5, keywords: ['apply', 'resume'], urlHint: true, negative: 'create an account' });
check(!signupJobs.ok, 'create-an-account step before applying: ' + signupJobs.score);
const newsletter = s({ hasEmail: true, fillable: 1, keywords: [], negative: 'subscribe' });
check(!newsletter.ok, 'newsletter signup: ' + newsletter.score);
const checkout = s({ hasName: true, hasEmail: true, hasPhone: true, fillable: 10, keywords: [], negative: 'checkout' });
check(!checkout.ok, 'shop checkout with many fields: ' + checkout.score);
const search = s({ fillable: 2, keywords: ['apply', 'links'], urlHint: true, negative: 'search jobs' });
check(!search.ok, 'job search page (a search box, "apply" links): ' + search.score);

console.log('\nguards');
check(!s({ resumeFile: true, keywords: ['apply', 'resume', 'cover', 'auth'], urlHint: true, fillable: 2 }).ok, 'needs at least 3 fillable fields, however many words match');
check(s({ keywords: ['apply', 'resume', 'cover', 'auth', 'experience', 'eeo', 'links', 'terms'] }).score === 4, 'keyword groups count at most 4');
check(s({}).score === 0 && !s(null).ok, 'empty page: 0');
check(Array.isArray(plain.why) && plain.why.some(w => /resume upload/.test(w)), 'reasons are explained (for debugging): ' + plain.why.join('; '));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
