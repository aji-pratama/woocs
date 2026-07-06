const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0' });
  const styles = await page.evaluate(() => {
    return Array.from(document.head.querySelectorAll('style')).map(s => ({
      id: s.getAttribute('data-vite-dev-id'),
      html: s.innerHTML.slice(0, 100)
    }));
  });
  console.log(JSON.stringify(styles, null, 2));
  await browser.close();
})();
