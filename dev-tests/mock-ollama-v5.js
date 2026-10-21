// Mock Ollama for the v0.5 tests: the v0.4 mock plus cover letters, match keywords, drafts and form answers.
const { createMock: createV4 } = require('./mock-ollama-v4');

function answersFor(user) {
  // questions are sent as JSON: [{"id":"f3","question":"Why do you want...","type":"long-text"}...]
  const out = {};
  for (const m of user.matchAll(/"id":"([^"]+)","question":"([^"]*)"/g)) if (/why do you want|why .* us\b/i.test(m[2])) out[m[1]] = 'I want to build reliable data pipelines with Python and SQL at a team that turns data into decisions. (mock essay)';
  return out;
}
function draftText(user) {
  const ins = (user.match(/Instruction from the candidate: ([^\n]*)/) || [])[1] || '';
  if (/shorter/i.test(ins)) return 'Shorter mock answer about Python and SQL pipelines.';
  if (/technical/i.test(ins)) return 'Technical mock answer: Airflow, Spark and dbt pipelines in Python and SQL.';
  if (/enthusiastic/i.test(ins)) return 'Enthusiastic mock answer: I would love to build pipelines with you.';
  if (/different version/i.test(ins) || (!ins && /Previous draft/.test(user))) return 'Regenerated mock answer, a fresh angle on data pipelines.';
  if (ins) return 'Custom mock answer following: ' + ins.slice(0, 60);
  return /Previous draft/.test(user) ? 'Regenerated mock answer, a fresh angle on data pipelines.' : 'First mock draft about data pipelines.';
}
function createMock(opts) {
  let coverCalls = 0;
  const route = (sys, j) => {
    const user = (j.messages || []).slice(1).map(m => m.content).join('\n');
    if (/You write a cover letter/.test(sys)) {
      coverCalls++;
      const p1 = 'At Northwind Analytics I build batch and streaming pipelines in Python and SQL, and I modeled our analytics data with dbt and PostgreSQL so teams could trust their Looker dashboards.';
      const p2 = coverCalls === 1 ? 'I also set up Terraform for every service and grew revenue by 45% last year.' : 'Your focus on experiments and clear communication with product managers matches how I like to work.';
      const co = (user.match(/^Job: .* at (.+)$/m) || [])[1] || 'hiring';
      return JSON.stringify({ greeting: `Dear ${co} hiring team,`, paragraphs: [p1, p2, `I would be glad to bring this to the ${(user.match(/^Job: (.+) at /m) || [])[1] || ''} role.`], closing: 'Sincerely,' });
    }
    if (/You pick the skills/.test(sys)) return JSON.stringify({ keywords: ['Snowflake', 'Airflow', 'Terraform', 'stakeholder management'] });
    if (/Write the candidate's answer to one job application question/.test(sys)) return draftText(user);
    if (/"question"/.test(user) && !/You read a resume|You tailor a resume/.test(sys)) return JSON.stringify({ answers: answersFor(user) });
    return null;
  };
  return createV4(Object.assign({}, opts, { route }));
}
module.exports = { createMock };
if (require.main === module) createMock({ port: +(process.argv[2] || 11434), models: ['qwen2.5:3b'], allowExtensionOrigin: true }).then(() => console.log('mock ollama v5 on', process.argv[2] || 11434));
