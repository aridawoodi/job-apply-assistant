// Node unit tests for the pure v0.4 helpers (no browser): tailoring validation, rules, file names.
// Run: node dev-tests/unit-v4.js
const T = require('../lib/tailor.js');
let failures = 0;
const check = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failures++; };
const master = { blocks: [
  { id: 'b0', type: 'name', text: 'Jordan Rivera', section: 'header' },
  { id: 'b1', type: 'heading', text: 'PROFESSIONAL SUMMARY', section: 'summary' },
  { id: 'b2', type: 'text', text: 'Data engineer with 6 years of experience building reliable pipelines and dashboards.', section: 'summary' },
  { id: 'b3', type: 'heading', text: 'WORK EXPERIENCE', section: 'experience' },
  { id: 'b4', type: 'entry', text: 'Data Engineer, Northwind Analytics\tMar 2021 – Present', section: 'experience', group: 'g1' },
  { id: 'b5', type: 'bullet', text: 'Designed data quality checks with Airflow that catch broken loads before analysts see them.', section: 'experience', group: 'g1' },
  { id: 'b6', type: 'bullet', text: 'Cut nightly job runtime by 40% by partitioning large tables and removing duplicate work.', section: 'experience', group: 'g1' },
  { id: 'b7', type: 'bullet', text: 'Partnered with product managers to define metrics for experiments and explained the results.', section: 'experience', group: 'g1' },
  { id: 'b8', type: 'entry', text: 'Software Developer, Contoso Retail\tJul 2018 – Feb 2021', section: 'experience', group: 'g2' },
  { id: 'b9', type: 'bullet', text: 'Maintained internal reporting tools used by 200 store managers.', section: 'experience', group: 'g2' },
  { id: 'b10', type: 'bullet', text: 'Automated weekly sales reports in Python, saving the finance team 6 hours a week.', section: 'experience', group: 'g2' },
  { id: 'b11', type: 'heading', text: 'SKILLS', section: 'skills' },
  { id: 'b12', type: 'text', text: 'Data: Airflow, Spark, dbt, PostgreSQL, Looker', section: 'skills' }
] };
const v = (raw, rules) => T.validate(raw, master, rules || []).changes;
const one = (raw, rules) => v(raw, rules)[0];

console.log('validation');
check(one({ bullets: [{ id: 'b7', text: 'Defined experiment metrics with product managers and explained the results.' }] }).ok, 'honest rewording passes');
check(!one({ bullets: [{ id: 'b6', text: 'Cut nightly job runtime by 60% by partitioning large tables and removing duplicate work.' }] }).ok, 'changed number blocked');
check(!one({ bullets: [{ id: 'b10', text: 'Built internal dashboards for 200 store managers.' }] }).ok, 'borrowing another bullet\'s facts blocked');
check(!one({ bullets: [{ id: 'b5', text: 'Cut nightly job runtime by 40% by partitioning large tables and removing duplicate work.' }] }), 'a copy of another bullet (wrong id) is re-attached to that bullet and dropped as "no change"');
const shifted = one({ bullets: [{ id: 'b5', text: 'Cut nightly job runtime by 40% by partitioning large tables and removing duplicated work.' }] });
check(shifted && shifted.id === 'b6' && shifted.ok && /another line/.test(shifted.problems.join()), 'a rewrite under the wrong id is matched to the bullet it rewrites (b6)');
check(!one({ bullets: [{ id: 'b9', text: 'Maintained internal reporting tools in Airflow used by 200 store managers.' }] }).ok, 'tool from a different job blocked');
check(!one({ bullets: [{ id: 'b5', text: 'Designed Kubernetes data quality checks with Airflow that catch broken loads before analysts see them.' }] }).ok, 'tool not in the resume blocked');
check(!one({ summary: [{ id: 'b4', text: 'Senior Data Engineer, Northwind Analytics\tMar 2021 – Present' }] }).ok, 'job title line can\'t be edited');
check(one({ skills: [{ id: 'b12', text: 'Data: Looker, PostgreSQL, dbt, Airflow, Spark' }] }).ok, 'skills reorder passes');
check(!one({ skills: [{ id: 'b12', text: 'Data: Looker, PostgreSQL, dbt, Airflow, Spark, Kafka' }] }).ok, 'skills addition blocked');
check(!one({ summary: [{ id: 'b2', text: 'Data engineer with 10 years of experience building reliable pipelines and dashboards.' }] }).ok, 'summary with a new number blocked');
check(one({ bullets: [{ id: 'b5', text: 'Designed data quality checks with Airflow that catch broken loads before analysts see them, and optimised them.' }] }, ['Use US spelling']).after.includes('optimized'), 'US spelling rule converts');
check(!one({ bullets: [{ id: 'b9', text: 'Maintained internal reporting tools that 200 store managers used.' }] }, ['Never change my Contoso bullets']).ok, 'protected group rule enforced');
check(!one({ bullets: [{ id: 'b7', text: 'Passionately partnered with product managers to define metrics for experiments and explained the results.' }] }, ['Never use the word "passionately"']).ok, 'forbidden word rule enforced');
const ro = v({ order: [{ group: 'g1', ids: ['b7'] }] })[0];
check(ro && ro.ok && ro.afterIds.join() === 'b7,b5,b6', 'partial reorder moves the listed bullet to the top');
console.log('rules');
const R = T.parseRules(['Keep to 2 pages', 'Never remove my Northwind bullets', "Don't change job titles", 'Use US spelling', 'Lead with leadership']);
check(R.pages === 2 && R.keep[0] === 'northwind' && R.usSpelling && R.notes.map(n => n.check).join() === 'pages,keep,titles,spelling,ai', 'parseRules: ' + R.notes.map(n => n.check).join());
console.log('file names');
const P = { firstName: 'Jordan', lastName: 'Rivera' };
check(T.fileBase(P, 'Anthropic', 'Performance Engineer (Remote - US)') === 'Jordan Rivera - Anthropic - Performance Engineer', 'location stripped: ' + T.fileBase(P, 'Anthropic', 'Performance Engineer (Remote - US)'));
check(T.fileBase(P, 'Acme', 'Data Analyst - New York, NY') === 'Jordan Rivera - Acme - Data Analyst', 'city stripped');
check(T.fileBase(P, 'Acme', 'Engineer (Identity Decisioning)') === 'Jordan Rivera - Acme - Engineer (Identity Decisioning)', 'team name kept');
check(T.fileBase(P, 'A/B: Co', 'Dev?') === 'Jordan Rivera - A B Co - Dev', 'unsafe filename characters removed (Windows + Mac)');
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
