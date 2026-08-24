/**
 * Cloudflare Worker - Proxy Privado y Seguro para Dr. Home Tech
 * Endpoint: API Pública de Mercado Libre Venezuela
 * Seller ID: 164580114
 */

const SELLER_ID = '1216174253';
const ML_API_BASE = `https://api.mercadolibre.com/sites/MLV/search?seller_id=${SELLER_ID}`;

// Cabeceras CORS universales
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

// 1. Escuchar el evento 'fetch' (Sintaxis Clásica de Cloudflare Workers)
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Manejo de peticiones preflight (OPTIONS) de los navegadores
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const url = new URL(request.url);
    
    // Permitir parámetros opcionales como ?limit=50 o ?q=ups
    const limit = url.searchParams.get('limit') || '50';
    const query = url.searchParams.get('q') || '';
    
    let targetUrl = `${ML_API_BASE}&limit=${limit}`;
    if (query) {
      targetUrl += `&q=${encodeURIComponent(query)}`;
    }

    // 3. Petición limpia a la API oficial de Mercado Libre
    const mlResponse = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!mlResponse.ok) {
      return new Response(
        JSON.stringify({
          error: true,
          status: mlResponse.status,
          message: `Error al consultar Mercado Libre API (Status: ${mlResponse.status})`
        }),
        {
          status: mlResponse.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json; charset=utf-8'
          }
        }
      );
    }

    const data = await mlResponse.json();

    // 4. Devolver la respuesta en formato JSON limpio con CORS habilitado
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300, s-maxage=600' // Cache de 5-10 minutos en el edge
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: true,
        message: err.message || 'Error interno en el Cloudflare Worker'
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8'
        }
      }
    );
  }
}
