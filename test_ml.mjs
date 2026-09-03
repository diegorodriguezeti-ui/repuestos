import https from 'https';

const url = "https://listado.mercadolibre.com.ve/_CustId_1216174253";

const options = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  }
};

https.get(url, options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const regex = /https:\/\/http2\.mlstatic\.com\/D_[^"\s\'>]+\.jpg/g;
    const matches = data.match(regex) || [];
    const uniqueImgs = [...new Set(matches)];

    console.log(`✅ CONEXIÓN EXITOSA: Se encontraron ${uniqueImgs.length} URLs de fotos.`);
    console.log("\nMuestra de fotos extraídas:");
    uniqueImgs.slice(0, 3).forEach(img => {
      console.log("- " + img.replace(/-[IV]\.jpg/, '-O.jpg'));
    });
  });
}).on('error', (err) => {
  console.log("❌ ERROR: " + err.message);
});
