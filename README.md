# Zeko Tara — iPhone için belge tarayıcı

Safari’de çalışan, “Ana Ekrana Ekle” ile bağımsız uygulama gibi açılan Türkçe belge tarayıcı.
Apple Developer hesabı gerekmez; GitHub Pages üzerinde ücretsiz yayınlanır.

- Kamerayla çekim ya da galeriden (çoklu) seçim
- Dört köşenin otomatik algılanması; köşe ve kenar tutamaçlarıyla parmakla düzeltme, büyüteç
- Perspektif düzeltme (belgenin gerçek en/boy oranı tahmin edilir)
- Orijinal, Renkli iyileştirme, Gri ve Siyah-beyaz görünümleri; döndürme; kırpmaya geri dönme
- Çok sayfalı belgeler: sayfa ekleme, basılı tutup sürükleyerek sıralama, düzenleme, silme
- PDF (Otomatik ya da A4 sayfa) ve JPEG olarak iOS paylaşım menüsüyle dışa aktarma
- Belgeler cihazda kalıcı saklanır (IndexedDB); uygulama çevrimdışı da açılır

**Gizlilik:** Fotoğraflar yalnızca cihazda işlenir. Hiçbir sunucuya, analitik servisine ya da üçüncü tarafa gönderilmez.

## GitHub Pages’te yayınlama

### Yol A — Tarayıcıdan (kurulum gerekmez)

1. <https://github.com> adresinde oturum açın. Sağ üstteki **+** → **New repository**.
2. **Repository name**: örneğin `zeko-tara`. **Public** seçili olsun (ücretsiz hesapta Pages için gerekir). **Create repository**.
3. Açılan sayfada **uploading an existing file** bağlantısına tıklayın.
4. Bu klasördeki her şeyi (`index.html`, `manifest.webmanifest`, `sw.js`, `.nojekyll`, `css`, `js`, `icons` klasörleri; isterseniz `tests`, `README.md`, `package.json` da) sayfaya sürükleyip bırakın. Klasör yapısı korunmalı: `js/core/detect.js` gibi.
5. Alttan **Commit changes**.
6. Depoda **Settings** → soldan **Pages** → **Build and deployment** altında **Source: Deploy from a branch**, **Branch: main**, klasör **/(root)** → **Save**.
7. 1–2 dakika sonra aynı sayfanın üstünde adres görünür: `https://KULLANICI-ADINIZ.github.io/zeko-tara/`.

### Yol B — git ile

[Git for Windows](https://git-scm.com/download/win) kurduktan sonra bu klasörde:

```bash
git init -b main
git add .
git commit -m "Zeko Tara ilk sürüm"
git remote add origin https://github.com/KULLANICI-ADINIZ/zeko-tara.git
git push -u origin main
```

Ardından Yol A’daki 6. ve 7. adımlar.

### Güncelleme yayınlama

Dosyaları değiştirip yeniden yüklediğinizde **`sw.js` içindeki `VERSION` değerini artırın** (örn. `zeko-tara-v1.0.1`).
Uygulama çevrimdışı çalışmak için dosyaları önbellekte tutar; sürüm değişmezse iPhone eski dosyaları kullanmaya devam eder.
Sürüm değişince uygulamada “Yeni sürüm hazır → Yenile” bildirimi çıkar.

## iPhone’a kurulum

1. iPhone’da **Safari** ile yayın adresini açın (Chrome vb. ana ekrana bağımsız uygulama olarak ekleyemez).
2. Alttaki **Paylaş** düğmesi → **Ana Ekrana Ekle** → **Ekle**.
3. Ana ekrandaki **Zeko Tara** simgesinden açın: adres çubuğu olmadan tam ekran açılır.

> Ana ekrandaki uygulamanın verileri Safari’den ayrıdır. Uygulamayı ana ekrandan silerseniz içindeki belgeler de silinir; önemli belgeleri **Dışa aktar → Dosyalar’a Kaydet** ile saklayın.

## iPhone test listesi

1. **Kurulum:** Ana ekran simgesinden açılıyor, adres çubuğu yok, üst çentik/alt çubuk alanında içerik kesilmiyor.
2. **Kamera:** *Tara* → kamera açılıyor → çek → *Fotoğrafı Kullan* → belge köşeleri mavi çerçeveyle işaretli.
3. **Galeri:** *Galeri* ile 3 fotoğraf seç → “1 / 3” görünüyor; *Tümünü ekle* hepsini ekliyor.
4. **Kırpma:** Köşe sürüklenince büyüteç çıkıyor; kenar ortasındaki tutamaç kenarı paralel kaydırıyor; köşeyi karşı köşenin ötesine çekince çerçeve kırmızı, bırakınca “Geçersiz seçim” ve eski yerine dönüş; *Tümü / Otomatik* geçişi çalışıyor.
5. **Görünüm:** Orijinal, Renkli, Gri, Siyah-beyaz aynı belge üzerinde önizleniyor; *Döndür* çalışıyor; *Kırp* ile geri dönüp köşeyi değiştirince yeni sonuç geliyor.
6. **Belge:** *Kaydet* sonrası belge ekranı; kamera/galeri + ile sayfa ekleniyor; sayfa basılı tutulup sürüklenerek sıralanıyor; sayfaya dokunup filtresi değiştirilip kaydediliyor; sayfa siliniyor.
7. **Dışa aktar (PDF):** *Paylaş* → *Dosyalar’a Kaydet* → Dosyalar uygulamasında PDF açılıyor; sayfa sırası doğru; A4 seçeneği de deneyin.
8. **Dışa aktar (JPEG):** *Paylaş* → *Görüntüleri Kaydet* → Fotoğraflar’da tüm sayfalar var.
9. **Kalıcılık:** Uygulamayı uygulama değiştiriciden kapatıp açın; belgeler, sıralama ve yeni adlar duruyor.
10. **Çevrimdışı:** Uçak modunu açıp uygulamayı başlatın; tarama ve dışa aktarma çalışıyor.
11. **Zor durumlar:** Beyaz masada beyaz kağıt, gölgeli çekim, yatay fotoğraf, ekran görüntüsü (PNG); algılama kaçarsa köşeler elle düzeltilebiliyor.

## Geliştirme

Derleme adımı yoktur; dosyalar olduğu gibi yayınlanır. Yerelde denemek için klasörü herhangi bir statik sunucuyla açın
(service worker ve kamera için `localhost` ya da HTTPS gerekir).

```
index.html, css/app.css      arayüz
js/app.js                    ekranlar ve akış
js/crop-view.js              dokunmatik kırpma görünümü (tutamaçlar, büyüteç, geçerlilik)
js/engine.js, js/worker.js   görüntü işlemeyi arka planda (Web Worker) çalıştırır
js/store.js                  IndexedDB ile kalıcı saklama
js/export.js, js/core/pdf.js PDF/JPEG dışa aktarma ve paylaşım
js/core/detect.js            köşe algılama (kenar haritası + Hough + dörtgen puanlama)
js/core/imageops.js          perspektif düzeltme, küçültme, döndürme
js/core/filters.js           kağıt arka planı tahmini ve görünüm filtreleri
sw.js, manifest.webmanifest  çevrimdışı çalışma ve ana ekran uygulaması
```

Görüntü işleme modülleri DOM kullanmaz ve Node ile test edilir:

```bash
node tests/run.mjs            # sentetik fotoğraflarda algılama doğruluğu + filtre çıktıları (tests/out)
N=100 node tests/run.mjs      # daha çok örnek
```

Gereksinim: iOS 15 ve üzeri (Safari modül Web Worker’ları, paylaşım menüsüyle dosya paylaşımı).
