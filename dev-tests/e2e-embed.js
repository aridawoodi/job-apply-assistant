const { chromium } = require('playwright');
const EXT = '/workspace/job-apply-extension';
(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/jaa-embed-' + Date.now(), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const fs = require('fs'); const sample = JSON.parse(fs.readFileSync(EXT + '/dev-tests/fixtures/test-profile.json'));
  await sw.evaluate(async (s) => chrome.storage.local.set(s), { profile: sample.profile, answerBank: sample.answerBank, settings: Object.assign(sample.settings, { useLLM: false }) });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:8765/embed.html');
  await page.waitForTimeout(9000);
  const frames = page.frames().map(f => f.url());
  console.log('frames:', frames);
  const gh = page.frames().find(f => /greenhouse/.test(f.url()));
  const hasHost = gh ? await gh.evaluate(() => !!document.getElementById('jaa-host')) : false;
  console.log('final frame url:', gh && gh.url(), '| floating button inside greenhouse iframe:', hasHost);
  if (hasHost) {
    await gh.locator('#jaa-host button.btn').click();
    await gh.waitForFunction(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel.open'), null, { timeout: 60000 });
    console.log((await gh.evaluate(() => document.getElementById('jaa-host').shadowRoot.querySelector('.panel').innerText)).split('\n').slice(0, 7).join(' | '));
  }
  await ctx.close();
})();
