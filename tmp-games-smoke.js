const { chromium } = require('C:/Users/its_c/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];

  page.on('pageerror', error => errors.push('pageerror: ' + error.message));
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      errors.push(msg.type() + ': ' + msg.text());
    }
  });

  await page.goto('http://localhost:4173/pages/games.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  await page.waitForSelector('.pgcdn-virtual, .pgcdn-status', { timeout: 30000 });
  await page.waitForTimeout(3000);

  const count = await page.locator('.pgcdn-card--virtual').count();
  await page.mouse.wheel(0, 1800);
  await page.waitForTimeout(500);
  const countAfter = await page.locator('.pgcdn-card--virtual').count();

  await page.fill('#pgcdn-search', 'moto');
  await page.waitForTimeout(500);
  const searchText = await page.textContent('#pgcdn-count');

  await page.click('[data-panel="history"]');
  await page.waitForTimeout(200);
  const historyVisible = await page.locator('#panel-history.active').count();

  await page.click('[data-panel="mygames"]');
  await page.waitForTimeout(500);
  const myVisible = await page.locator('#panel-mygames.active').count();

  console.log(JSON.stringify({
    count,
    countAfter,
    searchText,
    historyVisible,
    myVisible,
    errors
  }, null, 2));

  await browser.close();
})();
