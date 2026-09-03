/**
 * Serverless Function - Dynamic Sitemap Generator (sitemap.xml)
 * Leyendo códigos de repuestos desde Google Sheets CSV
 */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsLvqekIyjfzNbolMGUDJqFCXAplmu8OUlskAGo1aoo-ZyvrWgLZuFdphEaSOB1l_Tc1mPDKAydVk-/pub?output=csv';

function parseCsv(text) {
  const lines = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === '\n' && !inQuotes) {
      lines.push(cur);
      cur = '';
    } else if (c === '\r' && !inQuotes) {
      // ignore
    } else {
      cur += c;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length === 0) return [];

  const splitLine = (line) => {
    const cells = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          q = !q;
        }
      } else if (ch === ',' && !q) {
        cells.push(cell);
        cell = '';
      } else {
        cell += ch;
      }
    }
    cells.push(cell);
    return cells;
  };

  const headers = splitLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(obj);
  }

  return rows;
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default async function handler(req, res) {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      return res.status(500).send('Error fetching catalog data');
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    // Determine host protocol and domain
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'rodinvestparts.com';
    const baseUrl = `${proto}://${host}`;
    const today = new Date().toISOString().split('T')[0];

    const seenCodes = new Set();
    const urls = [];

    // Homepage
    urls.push(`
  <url>
    <loc>${escapeXml(baseUrl)}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);

    // Product pages (filtrando exclusivamente publicaciones activas)
    rows.forEach(row => {
      const estado = String(row['estado'] || '').trim().toLowerCase();
      if (estado && estado !== 'activa') return;

      const code = String(row['sku'] || row['codigo'] || row['número de publicación'] || '').trim();
      const title = String(row['título'] || row['titulo'] || '').trim();

      if (code && title && !seenCodes.has(code.toLowerCase())) {
        seenCodes.add(code.toLowerCase());
        const productUrl = `${baseUrl}/repuesto/${encodeURIComponent(code)}`;
        urls.push(`
  <url>
    <loc>${escapeXml(productUrl)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
      }
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(xml);

  } catch (error) {
    console.error('Error generating sitemap:', error);
    return res.status(500).send('Internal Server Error');
  }
}
