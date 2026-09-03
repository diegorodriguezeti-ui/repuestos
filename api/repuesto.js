/**
 * Serverless Function - Dynamic Product SSR Page (/repuesto/[codigo])
 * Pre-renderiza HTML completo con metadatos SEO y Schema.org para Google Bot y Usuarios
 */

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsLvqekIyjfzNbolMGUDJqFCXAplmu8OUlskAGo1aoo-ZyvrWgLZuFdphEaSOB1l_Tc1mPDKAydVk-/pub?output=csv';
const WHATSAPP_PHONE = '584146754699';

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req, res) {
  const targetCode = String(req.query.codigo || '').trim();

  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) {
      return res.status(500).send('Error al consultar el inventario de repuestos.');
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    // Normalize code search
    const normTargetCode = targetCode.toLowerCase();
    const item = rows.find(r => {
      const code = String(r['sku'] || r['codigo'] || r['número de publicación'] || '').trim().toLowerCase();
      const estado = String(r['estado'] || '').trim().toLowerCase();
      return (estado === 'activa' || !estado) && code === normTargetCode;
    });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'rodinvestparts.com';
    const canonicalUrl = `${proto}://${host}/repuesto/${encodeURIComponent(targetCode)}`;

    if (!item) {
      // 404 Not Found Page
      const notFoundHtml = `<!DOCTYPE html>
<html lang="es" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Repuesto no encontrado | ROD INVEST PARTS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>body { background-color: #090D16; color: #F3F4F6; font-family: 'Plus Jakarta Sans', sans-serif; }</style>
</head>
<body class="min-h-screen flex flex-col justify-between items-center p-6 text-center">
    <div class="my-auto max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div class="w-20 h-20 bg-red-500/10 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-red-500/20">
            <i data-lucide="package-x" class="w-10 h-10"></i>
        </div>
        <h1 class="font-heading text-2xl font-bold text-white mb-2">Repuesto no encontrado</h1>
        <p class="text-slate-400 text-sm mb-6">El código <strong>"${escapeHtml(targetCode)}"</strong> no existe en nuestro catálogo actual o fue descontinuado.</p>
        <a href="/" class="inline-flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-6 py-3 rounded-xl transition-all shadow-lg text-sm">
            <i data-lucide="arrow-left" class="w-4 h-4"></i> Volver al Catálogo Principal
        </a>
    </div>
    <script>lucide.createIcons();</script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(notFoundHtml);
    }

    // Extract item fields
    const codigo = String(item['sku'] || item['codigo'] || targetCode).trim();
    const titulo = String(item['título'] || item['titulo'] || 'Repuesto Caterpillar / Autoparte').trim();
    const stock = String(item['stock en tu depósito'] || item['stock'] || 'Disponible').trim();
    const precioRaw = String(item['precio'] || '0').trim();
    const descripcion = String(item['descripción'] || item['descripcion'] || 'Repuesto original de alta calidad disponible en ROD INVEST PARTS.').trim();

    const numericPrice = parseFloat(precioRaw.replace(/[^0-9.-]+/g, '')) || 0;
    const formattedPrice = numericPrice > 0 
      ? numericPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : precioRaw;

    // Title requirement: [titulo] [codigo] | ROD INVEST PARTS
    const pageTitle = `${titulo} ${codigo} | ROD INVEST PARTS`;
    const cleanDescription = descripcion.replace(/\s+/g, ' ').slice(0, 160).trim();

    const rawWhatsappMessage = `Hola ROD INVEST PARTS! Me interesa el repuesto ${titulo} (Código: ${codigo}) con el precio de US$ ${formattedPrice} que vi en la web. ¿Tienen disponibilidad?`;
    const whatsappUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(rawWhatsappMessage)}`;

    // Schema.org Product JSON-LD
    const jsonLd = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": `${titulo} (Cód: ${codigo})`,
      "sku": codigo,
      "mpn": codigo,
      "description": cleanDescription,
      "brand": {
        "@type": "Brand",
        "name": "ROD INVEST PARTS"
      },
      "offers": {
        "@type": "Offer",
        "url": canonicalUrl,
        "priceCurrency": "USD",
        "price": numericPrice > 0 ? numericPrice.toString() : "0",
        "availability": parseInt(stock) > 0 ? "https://schema.org/InStock" : "https://schema.org/InStock",
        "seller": {
          "@type": "Organization",
          "name": "ROD INVEST PARTS"
        }
      }
    };

    const fullHtml = `<!DOCTYPE html>
<html lang="es" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="google-site-verification" content="JU7O8kTbHu2CLKcAgcI3w5paqQbzBazut0mcGd97zkY" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(cleanDescription)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">

    <!-- Open Graph / Facebook / WhatsApp -->
    <meta property="og:type" content="product">
    <meta property="og:title" content="${escapeHtml(pageTitle)}">
    <meta property="og:description" content="${escapeHtml(cleanDescription)}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:site_name" content="ROD INVEST PARTS">

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    ${JSON.stringify(jsonLd, null, 2)}
    </script>

    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">

    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        'ml-yellow': '#FFE600',
                        'ml-yellow-bright': '#FFF159',
                        'tech-blue': '#0052CC',
                        'tech-blue-dark': '#0A2540',
                        'tech-blue-deep': '#06182E',
                        'tech-blue-accent': '#38BDF8',
                        'wa-green': '#25D366',
                        'wa-dark': '#1EA952'
                    },
                    fontFamily: {
                        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
                        heading: ['"Outfit"', 'sans-serif']
                    }
                }
            }
        }
    </script>

    <!-- Lucide Icons -->
    <script src="https://unpkg.com/lucide@latest"></script>

    <style>
        body { background-color: #090D16; color: #F3F4F6; -webkit-font-smoothing: antialiased; }
        .glass-header { background: rgba(10, 37, 64, 0.92); backdrop-filter: blur(12px); border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
        .glass-card { background: rgba(17, 24, 39, 0.85); backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.08); }
    </style>
</head>
<body class="min-h-screen flex flex-col font-sans">

    <!-- Top Announcement Bar -->
    <div class="bg-tech-blue-deep border-b border-blue-900/50 py-2 px-4 text-xs font-semibold text-slate-300">
        <div class="max-w-7xl mx-auto flex flex-wrap justify-between items-center gap-2">
            <div class="flex items-center gap-2">
                <span class="inline-flex items-center gap-1.5 bg-tech-blue text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded shadow">
                    <i data-lucide="shield-check" class="w-3.5 h-3.5 text-ml-yellow"></i> ROD INVEST PARTS
                </span>
                <span class="hidden sm:inline text-slate-400">| Repuesto Oficial Caterpillar & Autopartes</span>
            </div>
            <div class="flex items-center gap-4 text-slate-300 text-[12px]">
                <a href="${whatsappUrl}" target="_blank" class="flex items-center gap-1.5 text-wa-green font-bold hover:underline">
                    <i data-lucide="phone" class="w-3.5 h-3.5"></i> +58 414-6754699
                </a>
            </div>
        </div>
    </div>

    <!-- Main Navigation Header -->
    <header class="sticky top-0 z-40 glass-header shadow-2xl">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center justify-between h-20">
                <a href="/" class="flex items-center gap-3 group">
                    <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-tech-blue via-blue-600 to-tech-blue-dark flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform border border-blue-400/30">
                        <i data-lucide="cog" class="w-7 h-7 text-ml-yellow"></i>
                    </div>
                    <div class="flex flex-col">
                        <span class="font-heading font-black text-2xl tracking-tight text-white group-hover:text-ml-yellow transition-colors">
                            ROD INVEST <span class="text-ml-yellow">PARTS</span>
                        </span>
                        <span class="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                            Caterpillar & Autopartes
                        </span>
                    </div>
                </a>

                <a href="/" class="flex items-center gap-2 bg-tech-blue/20 hover:bg-tech-blue/40 border border-tech-blue/50 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-all">
                    <i data-lucide="grid" class="w-4 h-4 text-ml-yellow"></i>
                    <span>Ver Catálogo Completo</span>
                </a>
            </div>
        </div>
    </header>

    <!-- Main Product Detail View (Server-Rendered for GoogleBot) -->
    <main class="flex-1 max-w-4xl w-full mx-auto px-4 py-10">

        <!-- Breadcrumbs -->
        <nav class="flex items-center gap-2 text-xs text-slate-400 mb-6">
            <a href="/" class="hover:text-ml-yellow transition-colors">Catálogo</a>
            <i data-lucide="chevron-right" class="w-3.5 h-3.5 text-slate-600"></i>
            <span class="text-slate-200 font-semibold truncate">${escapeHtml(titulo)}</span>
        </nav>

        <!-- Product Card -->
        <div class="glass-card rounded-3xl p-6 sm:p-10 border border-slate-800 shadow-2xl relative">
            
            <!-- Badges -->
            <div class="flex flex-wrap items-center gap-3 mb-6">
                <span class="bg-tech-blue/20 text-tech-blue-accent border border-tech-blue/40 text-xs font-extrabold px-3 py-1.5 rounded-full uppercase tracking-wider">
                    Código: ${escapeHtml(codigo)}
                </span>
                <span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
                    <i data-lucide="box" class="w-4 h-4"></i> Stock: ${escapeHtml(stock)} unidades
                </span>
                <span class="bg-yellow-500/10 text-ml-yellow border border-yellow-500/30 text-xs font-semibold px-3 py-1 rounded-full">
                    Garantizado
                </span>
            </div>

            <!-- Title -->
            <h1 class="font-heading font-extrabold text-2xl sm:text-4xl text-white leading-tight mb-6">
                ${escapeHtml(titulo)}
            </h1>

            <!-- Price Box -->
            <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <span class="text-xs text-slate-400 font-medium block uppercase tracking-wider mb-1">Precio de Lista:</span>
                    <span class="font-heading font-black text-3xl sm:text-4xl text-ml-yellow tracking-tight">
                        US$ ${escapeHtml(formattedPrice)}
                    </span>
                </div>
                <div class="text-right text-xs text-slate-400">
                    <p class="flex items-center gap-1 text-emerald-400 font-semibold justify-end">
                        <i data-lucide="check-circle-2" class="w-4 h-4"></i> Disponible para envío
                    </p>
                    <p class="mt-1">Envíos a toda Venezuela (MRW, Zoom, Tealca)</p>
                </div>
            </div>

            <!-- Description -->
            <div class="mb-8">
                <h2 class="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-tech-blue-accent"></i> Descripción del Repuesto:
                </h2>
                <div class="bg-slate-900/50 rounded-2xl p-5 border border-slate-800/80 text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                    ${escapeHtml(descripcion)}
                </div>
            </div>

            <!-- Action Buttons -->
            <div class="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-slate-800">
                <!-- Direct WhatsApp Button -->
                <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" 
                    class="w-full sm:flex-1 bg-wa-green hover:bg-wa-dark text-white font-bold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-xl hover:shadow-emerald-900/40 transition-all text-base group">
                    <i data-lucide="message-square" class="w-6 h-6 group-hover:scale-110 transition-transform"></i>
                    <span>Consultar / Comprar por WhatsApp</span>
                </a>

                <!-- Back to Catalog -->
                <a href="/" class="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold py-4 px-6 rounded-2xl flex items-center justify-center gap-2 text-sm border border-slate-700/80 transition-all">
                    <i data-lucide="arrow-left" class="w-4 h-4 text-slate-400"></i>
                    <span>Ver más repuestos</span>
                </a>
            </div>

        </div>
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-800/80 bg-tech-blue-deep/60 py-8 px-4 text-center text-xs text-slate-400 mt-12">
        <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <p>© ${new Date().getFullYear()} ROD INVEST PARTS. Venta de repuestos para maquinaria pesada Caterpillar y autopartes.</p>
            <a href="/" class="text-tech-blue-accent hover:underline font-semibold">Ir al catálogo principal</a>
        </div>
    </footer>

    <script>
        lucide.createIcons();
    </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).send(fullHtml);

  } catch (error) {
    console.error('Error generating product page:', error);
    return res.status(500).send('Error interno en el servidor.');
  }
}
