const { chromium } = require('playwright');
const { inject, runFill, report } = require('./harness');
const URLS = [
  ['Greenhouse (live, job-boards)', 'https://job-boards.greenhouse.io/anthropic/jobs/5456619008'],
  ['Lever (live)', 'https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply'],
  ['Ashby (live)', 'https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application']
];
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
  const only = process.argv[2];
  for (const [name, url] of URLS) {
    if (only && !name.toLowerCase().includes(only)) continue;
    const page = await ctx.newPage();
    const posts = [];
    page.on('request', r => { if (r.method() === 'POST' && /apply|application|submit/i.test(r.url()) && !/graphql|analytics|collect|log/i.test(r.url())) posts.push(r.url()); });
    page.on('pageerror', e => console.log('PAGE ERROR', e.message.slice(0, 200)));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('input[type=email], input[name=email], #email', { timeout: 30000 });
      await page.waitForTimeout(2500);
      await inject(page);
      const r = await runFill(page);
      report(name, r);
      const urlAfter = page.url();
      console.log('  url unchanged?', urlAfter === url || urlAfter.split('?')[0] === url.split('?')[0], '| suspicious POSTs:', posts);
      const q = r.msgs.find(m => m.type === 'ollama:answer');
      if (q) console.log('  questions sent to model:', JSON.stringify(q.questions).slice(0, 1500));
      await page.waitForTimeout(500);
      const form = await page.$('#application-form, #application_form, #application-form, form'); await (form || page).screenshot({ path: `/workspace/jaa-tests/live-${name.split(' ')[0].toLowerCase()}.png` });
      await page.screenshot({ path: `/workspace/jaa-tests/live-${name.split(' ')[0].toLowerCase()}-viewport.png` });
    } catch (e) { console.log(`\n===== ${name} ===== ERROR`, e.message.slice(0, 300)); }
    await page.close();
  }
  await browser.close();
})();
