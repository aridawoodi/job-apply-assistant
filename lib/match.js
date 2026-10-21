/* Resume match score (v0.5). Deterministic and local: keywords come from a skills dictionary plus a
 * tf-idf style pick of terms that are frequent in this job description but rare in ordinary English
 * and job-ad boilerplate. The score is the weighted share of those keywords found in your resume.
 * Optional: the local AI can suggest extra keywords (only ones that appear in the description are kept). */
(function (g) {
  'use strict';
  const JAA = g.JAA = g.JAA || {};

  // canonical|alias|alias ... (matched case-insensitively on word boundaries)
  const SKILLS = (`python|py;java;javascript|js|ecmascript;typescript|ts;c++|cpp;c#|csharp|c sharp;go|golang;rust;ruby;php;kotlin;swift;scala;r|r language;matlab;perl;bash|shell scripting|shell;powershell;sql;nosql;graphql;html|html5;css|css3;sass|scss;
react|react.js|reactjs;react native;angular|angularjs;vue|vue.js|vuejs;svelte;next.js|nextjs;node.js|node|nodejs;express|express.js;django;flask;fastapi;spring|spring boot;rails|ruby on rails;.net|dotnet|asp.net;laravel;jquery;redux;tailwind|tailwind css;bootstrap;webpack;vite;
aws|amazon web services;azure|microsoft azure;gcp|google cloud|google cloud platform;lambda|aws lambda;ecs;eks;ec2;s3;cloudformation;terraform;ansible;puppet;chef;docker;kubernetes|k8s;helm;openshift;serverless;linux;unix;windows server;nginx;apache;
ci/cd|ci cd|continuous integration|continuous delivery|continuous deployment;jenkins;github actions;gitlab ci|gitlab;circleci;argo|argo cd|argocd;git;github;bitbucket;jira;confluence;
postgresql|postgres;mysql;sql server|mssql|t-sql;oracle;sqlite;mongodb|mongo;redis;cassandra;dynamodb;elasticsearch|elastic search|opensearch;snowflake;bigquery;redshift;databricks;spark|apache spark|pyspark;hadoop;hive;kafka|apache kafka;airflow|apache airflow;dbt;etl|elt;data pipelines|data pipeline;data warehouse|data warehousing;data lake;data modeling|data modelling;
pandas;numpy;scikit-learn|sklearn;tensorflow;pytorch;keras;jax;xgboost;machine learning|ml;deep learning;nlp|natural language processing;computer vision;llm|llms|large language models|large language model;generative ai|genai;rag|retrieval augmented generation;transformers;reinforcement learning|rlhf;statistics|statistical analysis;a/b testing|ab testing|experimentation|experiments;forecasting;time series;
tableau;power bi|powerbi;looker;metabase;excel|microsoft excel;google sheets;dax;vba;qlik;superset;
microservices;rest|rest api|restful|rest apis;grpc;api design|apis|api;distributed systems;system design;event-driven|event driven;websockets;oauth;sso|single sign-on;saml;
observability;monitoring;logging;prometheus;grafana;datadog;splunk;new relic;pagerduty;sentry;opentelemetry;
performance|performance tuning|performance optimization|profiling;latency;scalability|scalable;high availability;load balancing;caching;concurrency;multithreading;cuda;gpu|gpus;kernels;compilers;
security|information security|cybersecurity;iam;encryption;penetration testing;soc 2|soc2;gdpr;hipaa;pci|pci dss;
testing|unit testing|automated testing|test automation;tdd;selenium;cypress;playwright;jest;pytest;junit;qa|quality assurance;
agile;scrum;kanban;sdlc;devops;sre|site reliability;itil;servicenow;salesforce;hubspot;sap;workday;netsuite;zendesk;
figma;sketch;adobe xd;photoshop;illustrator;ux|user experience;ui|user interface;user research;wireframing|wireframes;prototyping;design systems;accessibility|wcag;
product management;roadmap|roadmaps|roadmapping;stakeholder management|stakeholders;project management;program management;okrs;kpis|kpi;go-to-market|gtm;market research;competitive analysis;
seo;sem;google analytics;content marketing;email marketing;crm;lead generation;copywriting;social media;
financial modeling|financial modelling;budgeting;forecast;accounting;gaap;fp&a;valuation;
communication|written communication|verbal communication;leadership;mentoring|mentorship;cross-functional|cross functional;collaboration;problem solving|problem-solving;ownership;customer support|customer service;technical support|help desk|helpdesk;troubleshooting;
ios;android;mobile;embedded;firmware;iot;blockchain;web3;solidity;
power apps|powerapps;power automate;power platform;dataverse;sharepoint;copilot studio;bash scripting;
openai;anthropic|claude;langchain;vector databases|vector database;pinecone;hugging face|huggingface;mlops;kubeflow;mlflow;sagemaker;vertex ai`)
    .split(';').map(x => x.trim()).filter(Boolean).map(x => { const parts = x.split('|').map(s => s.trim()); return { name: parts[0], forms: parts }; });

  // words that are everywhere in job ads (low idf), plus ordinary English
  const COMMON = new Set(('a about above across after again against all almost also always am among an and any are around as at be because been before being below between both but by can could did do does doing down during each either else ever every few for from further get gets getting give go going good great had has have having he her here hers him his how however i if in into is it its itself just keep know like made make makes making many may me might more most much must my need needs new no nor not now of off often on once one only or other our ours out over own part per please put rather really same see seem several shall she should since so some such take than that the their them then there these they thing things this those though through to too under until up upon us use used uses using very want was way we well were what when where whether which while who whom whose why will with within without work works would yet you your yours ' +
    'ability able responsibilities responsibility requirements required requirement qualifications qualification preferred plus bonus role roles position positions team teams company companies job jobs candidate candidates opportunity opportunities experience experienced years year day days strong excellent proven track record environment including include includes etc related relevant across help helping support supporting build building create creating develop developing development drive driving lead leading manage managing work working ensure ensuring provide providing deliver delivering partner partnering own owning looking join joining world business businesses customer customers people person employee employees benefits benefit salary pay equal employer applicants applicant disability veteran status gender race religion color national origin sexual orientation identity age law laws applicable policy policies office remote hybrid onsite location locations based full time full-time part-time contract us united states usa new york san francisco london mission values culture products product services service solutions solution impact high quality fast paced fast-paced growth growing ideal minimum degree bachelor bachelors master masters phd equivalent field computer science engineering engineer engineers knowledge skills skill understanding familiarity proficiency proficient hands hands-on deep solid demonstrated demonstrate passion passionate excited exciting love curious self-starter motivated detail-oriented attention details detail well-written written verbal communicate communicating communication collaborate collaborative').split(/\s+/));

  const norm = s => ' ' + String(s || '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9+#./&'\- ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const formRe = f => new RegExp('(^|[^a-z0-9+#])' + escRe(f) + '(?=$|[^a-z0-9+#])', 'g');
  const RE_CACHE = new Map();
  function countForm(text, f) { let re = RE_CACHE.get(f); if (!re) { re = formRe(f); RE_CACHE.set(f, re); } re.lastIndex = 0; let n = 0; while (re.exec(text)) n++; return n; }
  // single letters / tiny tokens ("r", "go", "c#") only count in lists / with tech context, to avoid "Go to market"
  const AMBIGUOUS = new Set(['r', 'go', 'rust', 'swift', 'spring', 'express', 'chef', 'puppet', 'shell', 'ui', 'ml', 'ts', 'js', 'py', 'node', 'rest', 'api', 'sap', 'mobile', 'performance', 'security', 'testing', 'logging', 'monitoring', 'caching', 'latency', 'forecast', 'kernels', 'workday', 'ownership', 'collaboration', 'leadership', 'communication', 'agile', 'excel']);
  const STRONG_AMBIG = new Set(['r', 'go', 'ts', 'js', 'py', 'ui', 'ml', 'shell', 'node', 'rest', 'api', 'spring', 'express', 'chef', 'puppet', 'swift', 'rust', 'sap', 'workday', 'forecast', 'kernels', 'mobile']);

  // requirement-ish sections weigh more than "about us"
  function sections(raw) {
    const lines = String(raw || '').split(/\n+/);
    let req = '', all = '';
    let inReq = false;
    for (const l of lines) {
      if (/^\s*(what you('|’)ll (bring|need)|requirements|qualifications|you (have|bring|should have)|must have|minimum|preferred|nice to have|skills|what we('|’)re looking for|about you|who you are)\b/i.test(l)) inReq = true;
      else if (/^\s*(about (us|the company)|benefits|perks|what we offer|compensation|equal opportunity|our (mission|values))\b/i.test(l)) inReq = false;
      if (inReq) req += l + '\n';
      all += l + '\n';
    }
    return { req: norm(req), all: norm(all) };
  }

  function extract(jdText, opts) {
    opts = opts || {};
    const { req, all } = sections(jdText);
    if (all.length < 80) return [];
    const out = new Map();
    // 1) dictionary terms
    for (const s of SKILLS) {
      let tf = 0, inReq = 0;
      for (const f of s.forms) { tf += countForm(all, f); inReq += req.length > 2 ? countForm(req, f) : 0; }
      if (!tf) continue;
      if (STRONG_AMBIG.has(s.name) && !/(language|stack|framework|experience with|proficien|tools?|such as|e\.g\.|including|,)/.test(all.slice(Math.max(0, all.search(formRe(s.forms[0])) - 60), all.search(formRe(s.forms[0])) + 60))) continue;
      const w = (1 + Math.log(tf)) * (inReq ? 1.6 : 1) * (AMBIGUOUS.has(s.name) ? 0.7 : 1.2);
      out.set(s.name, { term: s.name, forms: s.forms, weight: w, dict: true });
    }
    // 2) tf-idf style terms: frequent here, rare in boilerplate/English; prefer technical-looking or capitalised
    const rawTokens = String(jdText || '').replace(/[\u2018\u2019]/g, "'").match(/[A-Za-z][A-Za-z0-9+#.\-/]*[A-Za-z0-9+#]|[A-Za-z]{2,}/g) || [];
    const tf = new Map(), caps = new Map();
    rawTokens.forEach((w0, i) => {
      const w = w0.toLowerCase().replace(/\.$/, '');
      if (w.length < 3 || COMMON.has(w) || /^\d/.test(w)) return;
      tf.set(w, (tf.get(w) || 0) + 1);
      if (/^[A-Z]/.test(w0) && i > 0 && !/[.!?:]$/.test(rawTokens[i - 1])) caps.set(w, (caps.get(w) || 0) + 1);
    });
    const known = new Set(); out.forEach(v => v.forms.forEach(f => f.split(' ').forEach(x => known.add(x))));
    const cand = [];
    tf.forEach((n, w) => {
      if (known.has(w) || n < 2) return;
      const technical = /[+#./0-9]/.test(w) || (caps.get(w) || 0) >= Math.ceil(n / 2);
      const idf = technical ? 2.2 : (w.length > 7 ? 1.3 : 1.0);
      const inReq = req.includes(' ' + w + ' ') ? 1.4 : 1;
      cand.push({ term: w, forms: [w], weight: Math.log(1 + n) * idf * inReq * 0.8, dict: false, technical });
    });
    cand.filter(c => c.technical || c.weight > 1.4).sort((a, b) => b.weight - a.weight).slice(0, opts.extra == null ? 6 : opts.extra).forEach(c => { if (!out.has(c.term)) out.set(c.term, c); });
    // AI suggestions (validated: must literally appear in the description)
    (opts.aiKeywords || []).forEach(k => {
      const f = String(k || '').toLowerCase().trim();
      if (!f || f.length > 40 || out.has(f) || !countForm(all, f)) return;
      const known2 = SKILLS.find(s => s.forms.includes(f));
      if (known2 && out.has(known2.name)) return;
      out.set(known2 ? known2.name : f, { term: known2 ? known2.name : f, forms: known2 ? known2.forms : [f], weight: 1.2, dict: !!known2, ai: true });
    });
    return Array.from(out.values()).sort((a, b) => b.weight - a.weight).slice(0, opts.max || 24);
  }

  function score(keywords, resumeText) {
    const R = norm(resumeText);
    const stemmed = f => f.length > 4 ? [f, f.replace(/s$/, ''), f + 's'] : [f];
    let have = 0, total = 0;
    const matched = [], missing = [];
    for (const k of keywords) {
      total += k.weight;
      const hit = k.forms.some(f => stemmed(f).some(x => countForm(R, x)));
      if (hit) { have += k.weight; matched.push(k.term); } else missing.push(k.term);
    }
    const pct = total ? Math.round(100 * have / total) : 0;
    return { score: pct, matched, missing, total: keywords.length, matchedCount: matched.length };
  }

  function analyze(jdText, resumeText, opts) {
    const kws = extract(jdText, opts);
    return Object.assign(score(kws, resumeText), { keywords: kws.map(k => ({ term: k.term, weight: Math.round(k.weight * 100) / 100, dict: k.dict, ai: !!k.ai })) });
  }
  function hash(s) { let h = 5381; s = String(s || ''); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; }
  // the text the match uses for your resume: the parsed master (if any) + skills + resume text in the profile
  function resumeTextOf(profile, master) {
    const parts = [];
    if (master && Array.isArray(master.blocks)) parts.push(master.blocks.map(b => b.text).join('\n'));
    if (profile) {
      if (profile.resumeText) parts.push(profile.resumeText);
      if (Array.isArray(profile.skills)) parts.push(profile.skills.join(', '));
      if (profile.summary) parts.push(profile.summary);
      (profile.workHistory || []).forEach(j => parts.push([j.title, j.company].concat(j.bullets || []).join('\n')));
    }
    return parts.join('\n');
  }

  const api = { extract, score, analyze, hash, resumeTextOf, SKILLS };
  JAA.match = Object.assign(JAA.match || {}, { lib: api });
  if (typeof module !== 'undefined') module.exports = api;
})(typeof self !== 'undefined' ? self : this);
