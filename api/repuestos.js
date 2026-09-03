/**
 * Vercel Serverless Function - Proxy para Google Sheets CSV / API Repuestos
 * Source: Google Sheets publicado en CSV
 */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsLvqekIyjfzNbolMGUDJqFCXAplmu8OUlskAGo1aoo-ZyvrWgLZuFdphEaSOB1l_Tc1mPDKAydVk-/pub?output=csv';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        message: `Error al obtener hoja de cálculo CSV (Status ${response.status})`
      });
    }

    const csvText = await response.text();
    
    // Set cache headers
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return res.status(200).send(csvText);

  } catch (err) {
    return res.status(500).json({
      error: true,
      message: err.message || 'Error interno en el servidor serverless'
    });
  }
}
