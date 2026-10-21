const { chromium } = require('playwright');
const { inject, runFill, report } = require('./harness');
(async () => {
  const browser = await chromium.launch();
  let fail = 0;
  for (const [name, file, opts] of [['Greenhouse classic (mock)', 'greenhouse-classic.html', {}], ['Lever (mock)', 'lever.html', {}], ['Ashby (mock)', 'ashby.html', {}], ['Greenhouse classic, Ollama OFFLINE', 'greenhouse-classic.html', { ollamaMode: 'offline' }]]) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.goto('file:///workspace/jaa-tests/mocks/' + file);
    await inject(page, opts);
    // force adapter by hostname: file:// pages are "generic"; emulate site adapter via override
    await page.evaluate((f) => {
      const map = { 'greenhouse-classic.html': 'Greenhouse', 'lever.html': 'Lever', 'ashby.html': 'Ashby' };
      const a = JAA.sites.list.find(x => x.name === map[f]);
      JAA.sites.detect = () => a;
    }, file);
    const r = await runFill(page);
    report(name, r);
    if (r.submitted) { fail++; console.log('!! FORM WAS SUBMITTED'); }
    await page.screenshot({ path: `/workspace/jaa-tests/shot-${file.replace('.html', '')}${opts.ollamaMode ? '-offline' : ''}.png`, fullPage: true });
    if (name.startsWith('Lever')) console.log('  LLM questions sent:', JSON.stringify(r.msgs.find(m => m.type === 'ollama:answer')?.questions));
    await page.close();
  }
  await browser.close();
  process.exit(fail);
})();
