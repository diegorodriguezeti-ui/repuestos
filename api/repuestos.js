/**
 * Vercel Serverless Function - Proxy Seguro para Mercado Libre API
 * Endpoint: /api/repuestos?q=...&limit=50
 * Vendedor ID: 164580114
 */

const SELLER_ID = '1216174253';
const ML_API_BASE = `https://api.mercadolibre.com/sites/MLV/search?seller_id=${SELLER_ID}`;

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const query = req.query.q || '';
    const limit = req.query.limit || '50';
    const offset = req.query.offset || '0';

    let targetUrl = `${ML_API_BASE}&limit=${limit}&offset=${offset}`;
    if (query) {
      targetUrl += `&q=${encodeURIComponent(query)}`;
    }

    const response = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        status: response.status,
        message: `Error consultando Mercado Libre API (${response.status})`
      });
    }

    const data = await response.json();
    
    // Set cache headers
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || 'Error interno del servidor'
    });
  }
}
