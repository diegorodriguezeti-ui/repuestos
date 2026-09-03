import puppeteer from 'puppeteer';
import fs from 'fs';
import { execSync } from 'child_process';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log("🚀 Iniciando extracción con estructura explícita de paginación...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
  });

  const page = await browser.newPage();

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, 'languages', { get: () => ['es-VE', 'es-419', 'es', 'en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'es-VE,es-419;q=0.9,es;q=0.8,en;q=0.7',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  });

  const allProductsMap = new Map();

  // Cargar base previa de repuestos_ml.json si existe
  if (fs.existsSync('repuestos_ml.json')) {
    try {
      const existing = JSON.parse(fs.readFileSync('repuestos_ml.json', 'utf8'));
      if (Array.isArray(existing)) {
        for (const item of existing) {
          if (item.titulo) allProductsMap.set(item.titulo, item);
        }
        console.log(`📦 Base inicial: ${allProductsMap.size} repuestos cargados previamente.`);
      }
    } catch (e) {
      console.log("No se pudo leer base previa de repuestos_ml.json");
    }
  }

  let offset = 1;
  let pageNum = 1;
  let hasMore = true;

  while (hasMore) {
    // 1. Estructura exacta solicitada por el usuario
    const pageUrl = `https://listado.mercadolibre.com.ve/_CustId_1216174253_Desde_${offset}`;
    console.log(`\n📄 [Página ${pageNum} | Offset ${offset}] Cargando: ${pageUrl}`);

    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(3000);
    } catch (err) {
      console.log(`⚠️ Advertencia de navegación: ${err.message}. Continuando...`);
    }

    // 2. Si detecta que la URL incluye '/captcha/' o comprobaciones de seguridad
    let currentUrl = page.url();
    let currentTitle = await page.title();

    if (currentUrl.includes('/captcha/') || currentUrl.includes('account-verification') || currentUrl.includes('challenge') || currentTitle.includes('Seguridad')) {
      console.log("\n⚠️ ================================================================");
      console.log("⚠️ MERCADO LIBRE SOLICITA RESOLUCIÓN DE CAPTCHA EN PANTALLA.");
      console.log(`⚠️ URL actual: ${page.url()}`);
      console.log("⚠️ Resuelve el CAPTCHA manualmente en la ventana del navegador.");
      console.log("⚠️ Esperando hasta 30 segundos o hasta que el listado de productos esté listo...");
      console.log("================================================================\n");

      let elapsedSeconds = 0;
      const maxWaitSeconds = 30;

      while (elapsedSeconds < maxWaitSeconds) {
        try {
          const hasListado = await page.evaluate(() => 
            Boolean(document.querySelector('.poly-card, .ui-search-layout__item, .poly-component__picture, li.ui-search-layout__item'))
          );
          if (hasListado) {
            console.log("✅ Selector del listado detectado con éxito antes del tiempo límite.");
            break;
          }
        } catch (_) {}

        if (!page.url().includes('/captcha/') && !page.url().includes('account-verification')) {
          console.log("✅ Salida de la pantalla de CAPTCHA detectada.");
          break;
        }

        await sleep(2000);
        elapsedSeconds += 2;
        console.log(`⏳ Esperando resolución del CAPTCHA... (${elapsedSeconds}s / ${maxWaitSeconds}s)`);
      }

      await sleep(3000);
    }

    // Esperar selectores del catálogo
    try {
      await page.waitForSelector('.poly-card, .ui-search-layout__item, .poly-component__picture, img.poly-component__picture', { timeout: 12000 });
    } catch (_) {
      console.log("ℹ️ Esperando carga dinámica del DOM...");
    }

    // Scroll progresivo para activar imágenes en lazy-loading
    console.log(`⬇️ [Página ${pageNum}] Haciendo scroll progresivo para cargar fotos HD...`);
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight || totalHeight > 15000) {
            clearInterval(timer);
            resolve();
          }
        }, 120);
      });
    });

    await sleep(2000);

    // 2. Extraer productos buscando img.poly-component__picture, img[data-src], títulos y enlaces
    const pageItems = await page.evaluate(() => {
      let cards = Array.from(document.querySelectorAll('.poly-card, .ui-search-layout__item, li.ui-search-layout__item'));
      
      // Fallback si la estructura utiliza contenedores de imagen directos
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.poly-component__picture, img.poly-component__picture')).map(el => el.closest('li') || el.closest('div') || el);
      }

      const results = [];

      for (const card of cards) {
        if (!card) continue;

        // Título
        const titleEl = card.querySelector('.poly-component__title, .ui-search-item__title, h2, h3, a[title]');
        const titulo = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';
        if (!titulo || titulo.length < 3) continue;

        // Imagen HD con selector específico img.poly-component__picture o img[data-src]
        const imgEl = card.querySelector('img.poly-component__picture, img[data-src], img.ui-search-result-image__element, img');
        let rawImg = '';
        if (imgEl) {
          rawImg = imgEl.getAttribute('data-high-res-src') || 
                   imgEl.getAttribute('data-src') || 
                   imgEl.getAttribute('src') || '';
        }

        let imagen_hd = '';
        if (rawImg && rawImg.includes('http')) {
          imagen_hd = rawImg
            .replace(/-[IV]\.(jpg|webp)/i, '-O.$1')
            .replace(/-D\.(jpg|webp)/i, '-O.$1')
            .replace(/-E\.(jpg|webp)/i, '-O.$1');
        }

        // Link de ML
        const linkEl = card.querySelector('a.poly-component__title, a.ui-search-link, a[href*="mercadolibre"]');
        const link_ml = linkEl ? linkEl.href : '';

        // Precio
        const priceEl = card.querySelector('.andes-money-amount__fraction, .poly-price__current .andes-money-amount__fraction');
        const precio = priceEl ? `US$ ${priceEl.textContent.trim()}` : 'Consultar';

        // Intentar extraer código de parte presente en el título
        const words = titulo.split(/\s+/);
        let codigo = '';
        for (const w of words) {
          const cleanW = w.replace(/[^A-Za-z0-9-]/g, '');
          if (/\d/.test(cleanW) && /[A-Za-z]/.test(cleanW) && cleanW.length >= 4) {
            codigo = cleanW.toUpperCase();
            break;
          }
        }
        if (!codigo) {
          for (const w of words) {
            const cleanW = w.replace(/[^0-9]/g, '');
            if (cleanW.length >= 4 && cleanW.length <= 10) {
              codigo = cleanW;
              break;
            }
          }
        }

        results.push({
          codigo: codigo || 'ML',
          titulo,
          precio,
          stock: 'Disponible',
          descripcion: titulo,
          imagen_hd,
          link_ml
        });
      }

      return results;
    });

    console.log(`✅ [Página ${pageNum}] Extraídos ${pageItems.length} repuestos.`);

    if (pageItems.length === 0) {
      // Comprobar si realmente no hay items o si la página cambió de estructura
      const pageTitle = await page.title();
      console.log(`ℹ️ Título de la página: "${pageTitle}" | URL actual: ${page.url()}`);
      console.log(`🏁 No se encontraron repuestos en el offset ${offset}. Finalizando paginación.`);
      hasMore = false;
      break;
    }

    let addedCount = 0;
    for (const item of pageItems) {
      if (!allProductsMap.has(item.titulo)) {
        allProductsMap.set(item.titulo, item);
        addedCount++;
      } else {
        const existing = allProductsMap.get(item.titulo);
        if (!existing.imagen_hd && item.imagen_hd) {
          existing.imagen_hd = item.imagen_hd;
        }
      }
    }

    console.log(`📊 [Página ${pageNum}] Nuevos agregados: ${addedCount}. Total acumulado: ${allProductsMap.size}`);

    // Si la página retornó menos de 50 items, hemos llegado al final
    if (pageItems.length < 50) {
      console.log("🏁 Última página alcanzada (menos de 50 resultados).");
      hasMore = false;
      break;
    }

    // Incrementar de 50 en 50: 1, 51, 101, 151...
    offset += 50;
    pageNum++;
    await sleep(2500);
  }

  await browser.close();

  // Guardar en repuestos_ml.json
  const finalProducts = Array.from(allProductsMap.values()).map((p, idx) => ({
    id: idx + 1,
    ...p
  }));

  fs.writeFileSync('repuestos_ml.json', JSON.stringify(finalProducts, null, 2), 'utf8');
  console.log(`\n🎉 EXTRACCIÓN EXITOSA: ${finalProducts.length} repuestos guardados en repuestos_ml.json`);

  // Subir cambios a Git
  try {
    console.log("\n📦 Sincronizando con Git...");
    execSync('git add repuestos_ml.json extract_full_ml.mjs', { stdio: 'inherit' });
    execSync('git commit -m "feat: extraccion completa de fotos HD de todo el catalogo de ML"', { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log("🚀 Cambios subidos a GitHub con éxito!");
  } catch (gitErr) {
    console.log("ℹ️ Nota sobre Git:", gitErr.message);
  }
})();
