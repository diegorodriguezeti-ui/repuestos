import urllib.request
import re

url = "https://listado.mercadolibre.com.ve/_CustId_1216174253"
req = urllib.request.Request(
    url, 
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    }
)

try:
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        img_urls = re.findall(r'https://http2\.mlstatic\.com/D_[^"\s\'>]+\.jpg', html)
        unique_imgs = list(dict.fromkeys(img_urls))
        
        print(f"✅ CONEXIÓN EXITOSA: Se encontraron {len(unique_imgs)} URLs de fotos.")
        print("\nMuestra de fotos extraídas:")
        for img in unique_imgs[:3]:
            hd_img = re.sub(r'-[IV]\.jpg', '-O.jpg', img)
            print(f"- {hd_img}")

except Exception as e:
    print(f"❌ ERROR: {e}")
