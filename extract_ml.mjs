import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ 
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  const page = await browser.newPage();
  
  console.log("Navegando a tu catálogo...");
  try {
    await page.goto('https://listado.mercadolibre.com.ve/_CustId_1216174253', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log("Navegación inicial realizada (redirección detectada).");
  }

  console.log("\n⚠️ Si aparece un CAPTCHA o verificación en la pantalla que se acaba de abrir, resuélvelo manualmente en el navegador.");
  console.log("Esperando 15 segundos para que cargue la lista...");
  
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(15000);
  } else {
    await new Promise(r => setTimeout(r, 15000));
  }

  // Scroll progresivo
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });

  const productos = await page.evaluate(() => {
    const items = document.querySelectorAll('.ui-search-layout__item, .poly-card');
    const data = [];
    items.forEach(item => {
      const titleEl = item.querySelector('.ui-search-item__title, .poly-component__title, h2');
      const imgEl = item.querySelector('img');
      if (titleEl && imgEl) {
        const title = titleEl.innerText.trim();
        const src = imgEl.getAttribute('data-src') || imgEl.src;
        if (src && src.includes('mlstatic.com')) {
          data.push({
            titulo: title,
            imagen_hd: src.replace(/-[IV]\.jpg/, '-O.jpg')
          });
        }
      }
    });
    return data;
  });

  console.log(`\n✅ EXTRACCIÓN EXITOSA: ${productos.length} productos capturados.`);
  console.log(productos.slice(0, 5));

  await browser.close();
})();
