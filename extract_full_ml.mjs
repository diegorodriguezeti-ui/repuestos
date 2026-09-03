import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import { execSync } from 'child_process';

puppeteer.use(StealthPlugin());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  console.log("🚀 Iniciando Puppeteer con StealthPlugin y evasión avanzada...");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--start-maximized'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

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
    const pageUrl = `https://listado.mercadolibre.com.ve/_CustId_1216174253_Desde_${offset}`;
    console.log(`\n📄 [Página ${pageNum} | Offset ${offset}] Cargando: ${pageUrl}`);

    try {
      await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(2500);
    } catch (err) {
      console.log(`⚠️ Nota de navegación: ${err.message}`);
    }

    // Verificar si Mercado Libre muestra pantalla de seguridad o CAPTCHA
    let currentUrl = '';
    let currentTitle = '';
    try {
      currentUrl = page.url();
      currentTitle = await page.title();
    } catch (_) {}

    const isSecurityWall = () => {
      const u = page.url();
      return u.includes('/captcha/') || 
             u.includes('wall') || 
             u.includes('challenge') || 
             u.includes('account-verification') || 
             (currentTitle && currentTitle.includes('Seguridad'));
    };

    if (isSecurityWall()) {
      console.log("\n⚠️ ================================================================");
      console.log("⚠️ MERCADO LIBRE SOLICITA RESOLUCIÓN DE CAPTCHA / SEGURIDAD.");
      console.log(`⚠️ URL actual: ${page.url()}`);
      console.log("⚠️ La ventana se MANTENDRÁ ABIERTA INDEFINIDAMENTE.");
      console.log("⚠️ Por favor resuélvelo manualmente en la pantalla.");
      console.log("⚠️ Esperando a que el listado cargue para continuar...");
      console.log("================================================================\n");

      // Esperar indefinidamente (timeout: 0) hasta que aparezca el listado real
      await page.waitForSelector('.poly-card, .ui-search-layout__item, .poly-component__picture', { timeout: 0 });
      console.log("✅ Listado de productos detectado. Retomando extracción...");
      await sleep(3000);
    }

    // Esperar a que exista el contenedor de productos en el DOM
    try {
      await page.waitForSelector('.poly-card, .ui-search-layout__item, .poly-component__picture', { timeout: 15000 });
    } catch (_) {
      console.log("ℹ️ Comprobando elementos en la página...");
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

    // Extraer productos buscando selectores del catálogo
    let pageItems = await page.evaluate(() => {
      let cards = Array.from(document.querySelectorAll('.poly-card, .ui-search-layout__item, li.ui-search-layout__item'));
      
      if (cards.length === 0) {
        cards = Array.from(document.querySelectorAll('.poly-component__picture, img.poly-component__picture')).map(el => el.closest('li') || el.closest('div') || el);
      }

      const results = [];

      for (const card of cards) {
        if (!card) continue;

        const titleEl = card.querySelector('.poly-component__title, .ui-search-item__title, h2, h3, a[title]');
        const titulo = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';
        if (!titulo || titulo.length < 3) continue;

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

        const linkEl = card.querySelector('a.poly-component__title, a.ui-search-link, a[href*="mercadolibre"]');
        const link_ml = linkEl ? linkEl.href : '';

        const priceEl = card.querySelector('.andes-money-amount__fraction, .poly-price__current .andes-money-amount__fraction');
        const precio = priceEl ? `US$ ${priceEl.textContent.trim()}` : 'Consultar';

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

    // Si no encontró items, revisar si Mercado Libre redirigió a captcha durante el scroll
    if (pageItems.length === 0 && isSecurityWall()) {
      console.log("\n⚠️ Redirección a CAPTCHA detectada durante la carga.");
      console.log("⚠️ Esperando INDEFINIDAMENTE a que resuelvas el CAPTCHA en pantalla...");
      await page.waitForSelector('.poly-card, .ui-search-layout__item, .poly-component__picture', { timeout: 0 });
      console.log("✅ CAPTCHA resuelto. Reintentando extracción de la página...");
      await sleep(3000);
      continue; // Reintentar la misma página actual
    }

    console.log(`✅ [Página ${pageNum}] Extraídos ${pageItems.length} repuestos.`);

    if (pageItems.length === 0) {
      const pageTitle = await page.title();
      console.log(`ℹ️ Título de la página: "${pageTitle}" | URL actual: ${page.url()}`);
      console.log(`🏁 No se encontraron repuestos en el offset ${offset}. Fin del catálogo.`);
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

    // Si la página retornó menos de 50 items, llegamos a la última página
    if (pageItems.length < 50) {
      console.log("🏁 Última página alcanzada (menos de 50 resultados).");
      hasMore = false;
      break;
    }

    // Avanzar de 50 en 50
    offset += 50;
    pageNum++;
    await sleep(2500);
  }

  await browser.close();

  // Guardar catálogo consolidado en repuestos_ml.json
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
    execSync('git commit -m "feat: extraccion completa con puppeteer stealth y resolucion interactiva"', { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log("🚀 Repositorio actualizado en GitHub con éxito!");
  } catch (gitErr) {
    console.log("ℹ️ Nota sobre Git:", gitErr.message);
  }
})();
