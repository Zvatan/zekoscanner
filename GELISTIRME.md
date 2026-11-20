# Zeko Tara — Geliştirici notları

Bu dosya, projeyi daha sonra geliştirecek kişinin (sizin, başka bir geliştiricinin ya da bir yapay zekâ asistanının) ihtiyaç duyacağı bağlamı toplar.
Kurulum, yayınlama ve iPhone test listesi için `README.md`’ye bakın.

Son güncelleme: 2026-11-21 · Uygulama sürümü: 1.1.0 (`js/app.js` → `VERSION`, `sw.js` → `zeko-tara-v1.1.0`)

---

## 1. Amaç ve kısıtlar

- iPhone’da Safari üzerinden çalışan, **Paylaş → Ana Ekrana Ekle** ile bağımsız uygulama gibi açılan Türkçe belge tarayıcı (PWA).
- **Apple Developer hesabı yok.** App Store, TestFlight ya da yerel (native) uygulama seçeneği yok; her şey web teknolojisiyle çözülmeli.
- **GitHub Pages** üzerinde statik yayın (HTTPS). Derleme adımı, paket yöneticisi ya da çalışma zamanı bağımlılığı **yok**: düz ES modülleri.
- **Görüntüler yalnızca cihazda işlenir.** Sunucuya, analitik servisine, CDN’e istek yok. Bu bir ürün şartıdır; bunu bozan bir çözüm (bulutta OCR, harici betik vb.) önermeden önce kullanıcıya sorun.
- Arayüz metinleri ve kod yorumları Türkçe.
- Hedef: iOS 15 ve üzeri (modül Web Worker, dosya paylaşımı). `inert` özelliği iOS 15.5+; daha eskide sessizce yok sayılır.

## 2. Ürün kararları (kullanıcı onaylı, 2026-11-20)

| Konu | Karar | Nerede |
|---|---|---|
| Çıktı | PDF + JPEG, iOS paylaşım menüsüyle | `js/export.js` |
| Çok sayfa | Var; sıralama, ekleme, düzenleme, silme | `js/app.js`, `js/reorder.js` |
| Saklama | Cihazda kalıcı (IndexedDB); bulut yedeği yok | `js/store.js` |
| Kamera | iOS’un kendi kamerası (`<input capture>`); uygulama içi canlı kamera yok | `index.html` |
| Yeni sayfanın filtresi | Son kullanılan (ilk sefer: Sihirli) | `lastFilter()` |
| Sihirli yoğunluğu | 0–100 kaydırıcı, sayfa başına saklanır; yeni sayfa son değerle açılır (ilk 60) — 2026-11-21 | `lastStrength()`, `#strength-input` |
| PDF sayfa boyutu | Varsayılan Otomatik; A4 seçilebilir | `js/export.js`, `js/core/pdf.js` |
| Tema | Hep koyu | `css/app.css` |
| Galeriden çoklu seçim | Her fotoğraf sırayla kırpılır; “Tümünü ekle” kalanları otomatik ekler | `addAllRemaining()` |

Kullanıcı, kullanım deneyimini etkileyen kararlarda seçeneklerin kısaca açıklanmasını ve kendisine sorulmasını istiyor. Yukarıdaki varsayılanları sormadan değiştirmeyin.

## 3. Hızlı başlangıç (geliştirici)

```powershell
# Algoritma testleri (Node 18+; bağımlılık yok)
node tests/run.mjs                 # 40 sentetik fotoğraf, çıktılar tests/out/
$env:N = 100; node tests/run.mjs   # PowerShell'de örnek sayısı
$env:FSEED = 3; node tests/run.mjs # filtre örneği için başka tohum

# Yerelde çalıştırma (service worker için localhost ya da HTTPS gerekir)
npx http-server -c-1 .             # veya: python -m http.server 8000
```

- Masaüstünde “Tara” düğmesi kamera yerine dosya seçici açar; test için yeterli.
- iPhone’da yerel ağ IP’si (HTTP) güvenli bağlam sayılmaz; service worker çalışmaz. iPhone testini GitHub Pages adresinden yapın.
- Değişiklikten sonra iPhone’da eski sürüm görünüyorsa `sw.js` → `VERSION` artırılmamıştır (bkz. §9).

## 4. Mimari

### 4.1 Dosya haritası

| Dosya | Görev |
|---|---|
| `index.html` | Dört ekranın iskeleti, gizli dosya girişleri, bildirim/meşgul katmanları |
| `css/app.css` | Koyu tema, güvenli alanlar (`env(safe-area-inset-*)`), ekran geçişleri |
| `js/app.js` | Denetleyici: ekranlar, tarama oturumu, kaydetme, belge işlemleri, service worker kaydı |
| `js/crop-view.js` | Kanvas tabanlı kırpma görünümü: tutamaçlar, büyüteç, geçerlilik, yaylı geri dönüş |
| `js/reorder.js` | Basılı tutup sürükleyerek sayfa sıralama (FLIP animasyonu, kenarda otomatik kaydırma) |
| `js/export.js` | Dışa aktarma sayfası; PDF/JPEG hazırlama; Web Share ya da indirme |
| `js/store.js` | IndexedDB katmanı |
| `js/ui.js` | Simgeler (satır içi SVG), bildirim, meşgul katmanı, alt sayfa, onay/metin iletişim kutuları |
| `js/image-io.js` | Dosyayı kanvasa çizme (EXIF yönü, boyut sınırı), kanvas yardımcıları |
| `js/engine.js` | Worker istemcisi (söz tabanlı), worker yoksa ana iş parçacığına geri düşme |
| `js/worker.js` | Modül Web Worker’ı; `core/session.js`’i çalıştırır |
| `js/core/session.js` | Düzenleme oturumunun piksel durumu: yükle, düzelt, döndür, önizle, işle |
| `js/core/detect.js` | Köşe algılama |
| `js/core/geometry.js` | Köşe sıralama, geçerlilik, homografi, en/boy tahmini, çıktı boyutu |
| `js/core/imageops.js` | Alan ortalamalı küçültme, 90° döndürme, perspektif düzeltme |
| `js/core/filters.js` | Arka plan tahmini ve görünüm filtreleri |
| `js/core/pdf.js` | JPEG’leri yeniden sıkıştırmadan gömen küçük PDF yazıcı |
| `sw.js`, `manifest.webmanifest`, `icons/` | Çevrimdışı çalışma ve ana ekran uygulaması |
| `tests/` | Sentetik fotoğraf üreticisi, PNG kodlayıcı, algoritma testleri |

`js/core/` altındaki modüller **DOM kullanmaz**; tarayıcıda, worker’da ve Node’da aynı kod çalışır. Bu ayrımı koruyun: Node testleri buna dayanıyor.

### 4.2 Ekranlar ve akış

Ekran sırası `home < doc < crop < filter`. `go(name)` etkin ekrana `.is-active`, soldakilere `.is-behind` verir, diğerlerini `inert` yapar.
Ekranlar `visibility` ile gizlenir, `display:none` ile değil; kırpma görünümü gizliyken de boyutunu ölçebilmeli.

```
Belgelerim ──Tara/Galeri──▶ Kırp ──Uygula──▶ Görünüm ──Kaydet / Ekle / Sonraki──▶ Belge
                              ▲                  │
                              └────── Kırp ──────┘
Belge ──sayfaya dokun──▶ Görünüm (düzenleme) ──Kaydet──▶ Belge
Belge ──Kamera+ / Galeri+──▶ Kırp ──▶ Görünüm ──Ekle──▶ Belge
```

Oturum nesnesi (`app.session`):

```js
{
  mode: 'new' | 'add' | 'edit',
  docId,            // 'new' modunda ilk kayıtta oluşur
  queue: File[],    // sıradaki fotoğraflar (galeriden çoklu seçim)
  total, index,     // "2 / 5" göstergesi
  saved,            // bu oturumda kaydedilen sayfa sayısı
  page: {
    id,             // düzenlemede sayfa kimliği, yenide null
    canvas,         // kaynak fotoğraf (≤ 4096 px), iş bitince releaseCanvas
    srcBlob,        // yeni sayfada kaynağın JPEG'i (Promise)
    autoCorners,    // algılanan köşeler ya da null
    corners,        // kullanıcının onayladığı köşeler
    rotation,       // 0 | 90 | 180 | 270, düzeltmeden sonra uygulanır
    filter,         // 'original' | 'magic' | 'color' | 'gray' | 'bw'
    strength,       // Sihirli yoğunluğu 0–100 (diğer filtrelerde kullanılmaz)
    warped,         // en az bir kez düzeltildi mi
  },
}
```

Düğme davranışları:

- **Kırp → Vazgeç:** `page.warped` ise değişikliği bırakıp görünüme döner; değilse fotoğrafı eklemekten vazgeçer (kuyruk varsa onay ister).
- **Görünüm → Vazgeç:** düzenlemede değişiklikleri bırakır; yeni sayfada “Bu sayfa eklenmesin mi?” diye sorar.
- **Kaydet düğmesinin etiketi:** düzenlemede “Kaydet”, kuyruk varsa “Sonraki”, eklemede “Ekle”, yeni belgede “Kaydet”.
- Belgenin son sayfası silinirse belge de silinir.

### 4.3 Worker protokolü

`js/engine.js` önce `{ ping: true }` gönderir ve `{ pong: true }` bekler (4 sn). Ancak bu doğrulamadan sonra iş gönderir; çünkü aktarılan (transfer) tampon ana iş parçacığında boşalır ve kaybolabilir.
Worker başlatılamazsa aynı `createSession()` ana iş parçacığında çalışır. Çalışırken çökerse bekleyen işler hata alır, sonraki işler ana iş parçacığında yapılır.

| Mesaj | Girdi | Çıktı |
|---|---|---|
| `load` | `{ buffer (aktarılır), w, h, detect }` | `{ corners \| null }` |
| `warp` | `{ corners, rotation }` | `{ w, h }` (tam çözünürlük) |
| `rotate` | `{ quarter }` | `{ w, h }` |
| `preview` | `{ mode, strength }` | `{ buffer, w, h }` (≤ 1600 px) |
| `thumbs` | `{ strength }` | `[{ id, buffer, w, h }]` (her filtre için, ≤ 240 px) |
| `render` | `{ mode, strength }` | `{ buffer, w, h }` (tam çözünürlük) |
| `release` | — | `{}` |

Worker aynı anda tek bir oturum tutar (kaynak + düzeltilmiş + önizleme + küçük resim tabanı).

### 4.4 Veri modeli (IndexedDB `zeko-tara`, sürüm 1)

| Depo | Anahtar | İçerik |
|---|---|---|
| `docs` | `id` | `{ id, title, createdAt, updatedAt, pageIds[] }` — sayfa sırası `pageIds` sırasıdır |
| `pages` | `id` (+ `docId` dizini) | `{ id, docId, corners, autoCorners, rotation, filter, strength, srcW, srcH, outW, outH, createdAt, updatedAt }` |
| `blobs` | `"<sayfaId>:src"` | Kırpılmamış kaynak JPEG (q 0.92, ≤ 4096 px) — yeniden kırpma için |
|  | `"<sayfaId>:out"` | İşlenmiş tam çözünürlük JPEG (q 0.88) — dışa aktarılan budur |
|  | `"<sayfaId>:thumb"` | Küçük resim JPEG (≤ 360 px, q 0.8) |

- Görüntüler `{ buf: ArrayBuffer, type }` olarak saklanır, Blob olarak değil (bkz. §8).
- Köşeler **kaynak** fotoğrafın piksel koordinatındadır, sırası sol üst, sağ üst, sağ alt, sol alt (saat yönü).
- Şema değişikliğinde `DB_VERSION` artırılır ve `onupgradeneeded` içinde mevcut veriler taşınır. Kullanıcının belgeleri silinmemeli.
- `localStorage` anahtarları: `zt.filter`, `zt.magic` (son Sihirli yoğunluğu), `zt.installHint`, `zt.exportFormat`, `zt.pageSize`.

### 4.5 Dışa aktarma ve paylaşım

- Safari paylaşım menüsünü yalnız **dokunma olayının içinde, beklemeden** açar. Bu yüzden dosyalar sayfa açılınca (ve seçenek değişince) önceden hazırlanır; “Paylaş” düğmesi hazır dosyayla `navigator.share({ files })` çağırır.
- PDF: sayfaların `out` JPEG’leri DCTDecode akışı olarak yeniden sıkıştırılmadan gömülür.
  - **Otomatik:** sayfanın uzun kenarı A4 boyu olur (841.89 pt), oran görüntüden gelir.
  - **A4:** 595.28 × 841.89 pt sayfa; görüntü yataysa sayfa da yatay olur. Görüntü ortalanıp sığdırılır.
- PDF başlığı UTF-16BE (Türkçe karakterler için). Dosya adı `safeFileName()` ile temizlenir (`:` → `-`).
- Paylaşımı desteklemeyen tarayıcılarda (masaüstü) düğme “İndir” olur.

### 4.6 Service worker

- Önce önbellek stratejisi: `FILES` listesindeki her dosya kurulumda önbelleğe alınır. Gezinme istekleri önbellekteki `index.html` ile karşılanır.
- Güncelleme teklifi yalnız sayfa açıldığında zaten bir denetleyici varsa gösterilir (`hadController`). İlk kurulumda gösterilmez.
- “Yenile” → `{ type: 'activate' }` → `skipWaiting()` → `controllerchange` → sayfa yeniden yüklenir.

## 5. Algoritmalar ve ayar noktaları

### 5.1 Köşe algılama (`js/core/detect.js`)

Akış (küçük görüntüde, uzun kenar `DETECT_SIZE = 480`):

1. Üç renk kanalına 5 noktalı binom bulanıklaştırma.
2. **Sobel:** her pikselde en güçlü renk kanalının gradyanı alınır. Böylece parlaklığı benzer ama rengi farklı zeminlerde de kenar bulunur.
3. **NMS + histerezis.** Eşikler `hi = max(20, min(0.6·P85, 3·P50))`, `lo = max(10, 0.45·hi)`. Medyan sınırı olmazsa metnin güçlü kenarları eşiği yükseltir ve soluk kağıt kenarları kaybolur.
4. **Kutup (parlaklık yönü) duyarlı Hough:**
   - 360 açı kutusu; normal = koyudan açığa gradyan yönü.
   - Her kenar pikseli kendi yönünün ±6° çevresine oy verir; ρ yönünde 3’lü toplanır.
   - En az `max(12, 0.07·kısa kenar)` oy; yerel tepe penceresi ±3° / ±5 px; yinelenen tepe eşiği Δθ ≤ 4°, Δρ ≤ 8 px.
5. **Doğru seçimi (`selectLines`):**
   - Doğrular ±10°’lik yön gruplarına ayrılır.
   - Her gruptan en güçlü doğru ile en dıştaki iki doğru (grup en güçlüsünün oylarının en az %30’u olanlar arasında en küçük ve en büyük ρ) seçilir; ardından grubun 2. ve 3. güçlüleri eklenir; en fazla 28 doğru.
   - *Neden:* metin satırları ve çizgili zeminler aynı yönde çok sayıda güçlü doğru üretir; kağıt kenarı ise kendi yönündekilerin en dışında kalır.
6. **Dörtgen adayları:**
   - Her 4’lü doğru ve 3 eşleştirme denenir; görüntünün dört kenarı da (kadraja sığmayan belge için) aday doğrudur.
   - Koşullar: karşılıklı kenarlar |cos| ≥ 0.7, komşular |cos| ≤ 0.87; köşeler görüntünün %3 payı içinde; dışbükey; alan ≥ %10; iç açılar 35°–145°.
7. **Puan (`scoreQuad`):**
   - Tüm gerçek kenarlarda aynı geçiş yönü olmalı (kağıt zeminden ya hep açık ya hep koyu).
   - Her kenar en az %25 desteklenmeli; en az 2 gerçek kenar olmalı.
   - `puan = (destekli − 0.5·desteksiz + 0.1·√alan) · 0.7^(görüntü kenarı sayısı)`; en düşük puan `0.35·(w+h)`.
   - Kenar desteği, doğru boyunca ±2 px içinde yönü uyumlu (±25°) kenar pikseli sayısıdır; önek toplamlarıyla O(1) hesaplanır.
8. **Genişletme (`expandQuad`):** bir kenar, aynı yönde (±8°) ve merkezden daha uzakta duran bir doğruya taşınabilir. Şart: yeni kenarın en az %50’si, komşu kenarların yeni uzayan parçalarının en az %60’ı desteklenmeli. Metin ya da tablo çizgisine oturmuş kenarı gerçek kağıt kenarına taşır.
9. **Tam çözünürlükte iyileştirme (`refineQuad`):**
   - Her kenarda 40 noktada, normal doğrultusunda ±`max(4, 2.5·ölçek)` px içinde beklenen yöndeki en güçlü parlaklık geçişi aranır; alt-piksel parabol uydurulur.
   - Noktalara aykırı değer ayıklamalı toplam en küçük kareler doğrusu oturtulur.
   - Doğru 4°’den fazla dönerse ya da köşe 3·yarıçaptan fazla kayarsa eski sonuç korunur.
10. Algılama içeride **piksel indeksiyle** çalışır; dışarıya verilirken +0.5 ile kesintisiz koordinata geçilir. Bulunamazsa `null` döner ve arayüz tüm fotoğrafı seçer.

Ölçülen durum (`N=100`, sentetik): **96/100 başarılı** (köşe hatası < köşegenin %1’i), medyan hata ~0.01%, ~25 ms. Bilinen başarısız tohumlar:

- **#10:** belge, altındaki neredeyse aynı renkte başka bir kağıtla birleşiyor.
- **#30, #36, #43:** beyaza yakın masa ile gölge, çizgili örtü ya da mercek bükülmesi birlikte.

Parametre değiştirirken önce/sonra `N=100` sonuçlarını karşılaştırın. Gerçek fotoğraflarla doğrulama henüz yapılmadı (§10).

### 5.2 Perspektif düzeltme ve çıktı boyutu

- `geometry.js → outputSize()`:
  - Çözünürlük kenar uzunluklarından gelir.
  - En/boy oranı, dikdörtgenin perspektif altındaki görüntüsünden tahmin edilir (Zhang & He, *Whiteboard scanning and image enhancement*). Ana nokta görüntü merkezi kabul edilir; odak `0.35–8 × uzun kenar` dışındaysa ya da sonuç kenar oranından 1.6 kattan fazla saparsa kenar oranı kullanılır.
  - Sınırlar: uzun kenar ≤ 3508 px (A4, 300 dpi), toplam ≤ 12 MP.
- `imageops.js → warpPerspective()`: birim kare → dörtgen homografisi (Heckbert), çift doğrusal örnekleme. Satır başına artımlı hesaplanır.
- `session.js → EDGE_INSET = 0.003`: belge düzleminde her kenardan %0,3 pay bırakılır; köşe birkaç piksel kaysa da kenarda zemin şeridi kalmaz. Sıfırlanırsa ince renkli kenar çizgisi geri gelir.
- Önizleme ≤ 1600 px, filtre küçük resimleri ≤ 240 px. Küçültme alan ortalamalıdır (metinde moiré yok).

### 5.3 Filtreler (`js/core/filters.js`)

Ortak adım **kağıt arka planı tahmini** (`estimateBackground`):

1. Uzun kenar boyunca ~80 hücrelik ızgara; her hücrede 32 kutulu parlaklık histogramı; en parlak %25’in ortalama rengi.
2. Kapama (1 hücre büyütme + küçültme): kalın başlıkları siler.
3. **Kağıt bölgesi büyütme:**
   - Tohumlar: parlaklık ≥ %85 ve renk tonu kağıda yakın (≤ 0.10) hücreler.
   - Komşuya geçiş şartları: parlaklık ≥ %40, ton farkı ≤ 0.12, komşular arası parlaklık farkı ≤ %8.
   - Gölge yavaş değiştiği için kağıda katılır; fotoğraf, renkli kutu, parmak gibi keskin sınırlı bölgeler katılmaz.
4. Katılmayan hücreler çevredeki kağıttan harmonik olarak doldurulur (80 yineleme), sonra yumuşatılır. Kağıt hücreleri %10’dan azsa (ör. tam sayfa fotoğraf) yalnız genel beyaz dengesi uygulanır.
5. Her piksel kanal kanal arka plana bölünür → kağıt ≈ 1.

Görünümler:

- **Sihirli** (`magicEnhance`, yoğunluk s = 0–1): arka plan normalizasyonundan sonra parlaklık kanalına boyuta oranlı unsharp mask (yarıçap ≈ uzun kenar / 700, miktar 1.1·s); ton eğrisi siyah 0.04→0.26, beyaz 0.96→0.80, gama 1→1.6; renk farkı ×(1.05→1.40) eklenir, koyu bölgelerde azaltılır (siyah metinde renk gürültüsü olmasın). s = 0 yalnız temizlenmiş görüntü; s = 1 en sert tarayıcı görünümü. Parlaklık bellek için 16 bit tutulur (`boxBlur16`). Miktar 1.6'da harflerde halka oluştuğu için 1.1'e indirildi.

- **Renkli:** eğri (siyah 0.10, beyaz 0.90, gama 1.25) + doygunluk ×1.3.
- **Gri:** normalize parlaklık + eğri (0.08, 0.92, gama 1.15).
- **Siyah-beyaz:** normalize parlaklıkta Otsu eşiği (0.45–0.80 arasında sınırlı), ±0.06 yumuşak geçiş (tırtıksız kenar).
- **Orijinal:** yalnız düzeltilmiş görüntü.

Tüm uzamsal ölçüler görüntü boyutuna oranlıdır; önizleme ile tam çözünürlüklü çıktı aynı görünmelidir. Yeni bir filtre eklerken de bu kuralı koruyun.

### 5.4 Kırpma ekranı kuralları

Bu kurallar, REA ile incelenen referans bir masaüstü tarayıcı uygulamasının gözlenen davranışından türetildi; kod bağımsız yazıldı.

- Algılanan köşeler saat yönünde sıralanır ve (0,0)’a en yakın köşe başa alınır (`normalizeQuad`). Algılama başarısızsa tüm fotoğraf seçilir.
- Modlar: **Otomatik** (algılanan), **Tümü** (tüm fotoğraf), sürüklenince özel. Düğme, dokununca geçilecek modu gösterir.
- Dört köşe tutamacı + dört kenar ortası tutamacı.
  - Kenar, kendi normali doğrultusunda paralel kayar. Referansta kenar serbest kayıyordu; dokunmada daha kontrollü olduğu için normal doğrultusu seçildi.
- Köşeler görüntü dışına çıkamaz.
- **Geçerlilik:** dışbükey + her kenar ≥ 40 ekran pikseli (referansta 48). Geçersizken çerçeve kırmızı ve kesikli olur, “Uygula” pasifleşir. Bırakınca “Geçersiz seçim” uyarısı çıkar ve köşeler 200 ms’de son geçerli yere döner: `c = 1 − (1 − t)³ · cos(0.8πt)`.
- Köşe sürüklenirken parmağın üstünde (yer yoksa altında) 120 px’lik, 2.6× büyüteç görünür.
- Dokunma isabet yarıçapları: köşe 38 px, kenar 30 px; görüntü çevresinde 26 px pay (iOS kenar hareketleriyle çakışmasın).
- Referans uygulamadan bilinçli farklar:
  - Referansta görünüm filtreleri bulutta uygulanıyor ve filtre küçük resimleri sabit simgeler. Burada her şey cihazda ve önizlemeler gerçek belge üzerinde.
  - Referansın görünüm listesi (Orijinal, Geliştir, Sihir Pro, Aydınlat, Gölgesiz, S&B, Eko, El yazısını sil) gelecekteki filtreler için fikir kaynağıdır (§10).

## 6. Arayüz ve tasarım kuralları

- Renk değişkenleri `css/app.css` başındaki `:root` içinde.
  - Ana renk `--accent #3c6ef0`, metin düğmeleri `--accent-text #86a9ff`.
  - Ana rengin beyaz yazıyla kontrastı ≈ 4.49:1, yani WCAG AA sınırının (4.5) hemen altında. `#3768e8` gibi biraz koyu bir ton ≈ 4.9:1 verir.
  - Kırpma çerçevesi: geçerli `#6E9BFF`, geçersiz `#FF5A5F`.
- Dokunma hedefleri ≥ 44 px. Metin girişleri 17 px (16 px altında iOS sayfayı yakınlaştırır).
- `apple-mobile-web-app-status-bar-style: black-translucent` kullanılıyor; içerik durum çubuğunun altına uzanır. Üst/alt dolgular `env(safe-area-inset-*)` ile verilir. Açık tema eklenirse durum çubuğu yazısı beyaz kalacağı için üst çubuk koyu tutulmalı.
- Arayüz simgeleri `js/ui.js → PATHS` içinde, 24×24, `stroke-width 1.8`. Statik HTML’de `<i data-icon="camera"></i>` gibi yazılır, açılışta SVG’ye çevrilir.
- Uygulama simgeleri `icons/` altında: `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
  - Tasarım: köşegen mavi geçiş (`#4C7CFF` → `#1E3AAA`); ortada kıvrık köşeli beyaz sayfa ve gri satırlar; çevresinde dört beyaz tarama köşeliği.
  - Maskable sürümde içerik %80’e küçültülüdür.
  - Simgeler PowerShell + System.Drawing ile üretildi; betik depoda değil, herhangi bir çizim aracıyla yeniden yapılabilir.
  - 180 px’lik `apple-touch-icon.png` saydamlık içermemeli; iOS köşeleri kendisi yuvarlar.

## 7. Test

### 7.1 Algoritma testleri (depoda)

- `tests/synth.mjs`: kendinden tohumlu sentetik belge fotoğrafı üretir.
  - Zemin: ahşap, gri, lacivert, bej, siyah, beyaza yakın.
  - Zorlaştırıcılar: dağınık nesneler (başka kağıt, telefon, kitap, not), çizgili örtü, bulanıklık, mercek bükülmesi, gölge, parmak, metin satırları, tablo ve renkli fotoğraf bloğu.
  - Gerçek köşeler bükülme dahil hesaplanır.
- `tests/run.mjs`: algılama doğruluğu, perspektif düzeltme ve filtre çıktıları (`tests/out/*.png`). Başarı oranı %90’ın altına düşerse çıkış kodu 1 olur.
- `tests/png.mjs`: bağımlılıksız PNG kodlayıcı ve dörtgen çizimi (görsel kontrol için).
- `detectQuad(rgba, w, h, debug)`: `debug` nesnesi verilirse eşikleri (`p50, p85, hi, lo`), kenar haritasını ve doğruları doldurur; algılama hatalarını incelemek için kullanın.

### 7.2 Uçtan uca testler (2026-11-20’de yapıldı, betikler depoda değil)

İlk sürüm Playwright (`playwright-core`) ile iki motorda baştan sona denendi:

- Edge 157 (`chromium.launch({ channel: 'msedge' })`)
- WebKit 27.2 (`npx playwright-core install webkit`, Safari motoru)

Her ikisinde tüm adımlar geçti ve konsolda hata yoktu. Yeniden kurmak için:

1. **Ortam:**
   - Klasörü `http://127.0.0.1:PORT/` üzerinden sunun.
   - Bağlam: `viewport 390×844`, `deviceScaleFactor 3`, `isMobile`, `hasTouch`, iPhone Safari kullanıcı ajanı (kurulum bandı görünsün), `locale 'tr-TR'`.
2. **Fotoğraflar:** `synthPhoto(seed, 2016, 1512)` + `encodePng` ile üretip `page.setInputFiles('#input-camera' | '#input-gallery', ...)` ile verin.
3. **Kırpma tutamaçları:** `const cv = (await import('/js/app.js')).cropView; cv.toScreen(cv.pts[i])` değerini `.crop-canvas` dikdörtgenine ekleyip `page.mouse` ile sürükleyin. `cropView` bu yüzden `app.js`’ten dışa aktarılıyor; kaldırmayın.
4. **Paylaşım:** `context.addInitScript` ile `navigator.canShare = () => true` ve dosyaları yakalayan bir `navigator.share` tanımlayın. Dosyaları base64 olarak `window.__shared`’a yazıp diske kaydedin; PDF başlığını (`%PDF-1.4`) ve sonunu (`%%EOF`) kontrol edin.
5. **Beklemeler:** ekran için `#screen-<ad>.is-active`, iş bitimi için `body` üzerinde `is-busy` sınıfının kalkması.
6. **Kapsanan senaryolar:**
   - Algılama, köşe ve kenar sürükleme, büyüteç, geçersiz seçim ve geri dönüş, Tümü/Otomatik.
   - Uygula, dört filtre, döndürme, kırpmaya dönüp Vazgeç.
   - Kaydet, galeriden 2 sayfa ile “Tümünü ekle”, sürükleyerek sıralama, sayfa düzenleme.
   - PDF / JPEG / A4 paylaşımı, Türkçe karakterli yeniden adlandırma, sayfa yenileyince kalıcılık.
7. **Service worker:**
   - `context.setOffline(true)` + yeniden yükleme ile çevrimdışı açılış.
   - Güncelleme: diskte `sw.js` → `VERSION`’ı değiştirip `reg.update()` çağırın; “Yeni sürüm hazır” bildirimi ve “Yenile” ile yeni önbelleğe geçiş görülmeli. Testten sonra `VERSION`’ı geri almayı unutmayın.

### 7.3 Gerçek cihaz

`README.md` → “iPhone test listesi”. Masaüstü motorlarında görülemeyenler yalnızca iPhone’da test edilebilir:

- Kamera ve galeri seçicisi.
- Ana ekran modu.
- Paylaşım menüsünün “Dosyalar’a Kaydet” ve “Görüntüleri Kaydet” seçenekleri.
- Bellek sınırları.
- Klavyenin açılması.

## 8. Tuzaklar (bunları bozmayın)

1. **Paylaşım dokunma anında başlamalı.** `navigator.share` öncesinde `await` olmamalı; dosyalar önceden hazırlanır (`export.js`).
2. **iOS klavyesi** yalnız dokunma olayının içinde verilen odakla açılır. `sheet()`’in `build` fonksiyonu bir “mounted” fonksiyonu döndürebilir; bu fonksiyon sayfa belgeye eklenir eklenmez eşzamanlı çağrılır (`promptDialog`).
3. **Kanvas belleği:**
   - iOS’ta kanvas alanı ≤ 16.7 MP ve toplam kanvas belleği sınırlıdır.
   - `MAX_SIDE = 4096` ve `MAX_PIXELS = 16 000 000` korunmalı.
   - İşi biten kanvas `releaseCanvas()` (0×0) ile bırakılmalı.
4. **IndexedDB’de Blob değil ArrayBuffer saklayın.** Bazı Safari sürümlerinde IndexedDB’den okunan Blob’lar sonradan okunamaz hale geliyor.
5. **Worker’a aktarılan tampon** ana tarafta boşalır. Ping doğrulamasından önce aktarım yapmayın; aynı tamponu iki kez göndermeyin.
6. **Koordinatlar:**
   - Algılama piksel indeksiyle çalışır, dışarıya +0.5 ile kesintisiz koordinat verir.
   - Saklanan köşeler kaynak fotoğraf koordinatındadır.
   - Düzenlemede kaynak boyutu değiştiyse köşeler `srcW` oranıyla ölçeklenir.
7. **FLIP animasyonu sırasında isabet testi** `getBoundingClientRect` ile yapılmaz (dönüşümü içerir, öğeler ileri geri yer değiştirir). `offsetLeft/offsetTop` (yerleşim konumu) kullanılır.
8. **Service worker ilk kurulumda “Yeni sürüm” teklif etmemeli.** WebKit `statechange` olayını kurulum bittikten sonra iletebiliyor; bu yüzden `hadController` kontrolü var.
9. **Yeni bir dosya eklendiğinde** `sw.js` → `FILES` listesine eklenmeli; yoksa çevrimdışı açılış bozulur. Her yayında `VERSION` artırılmalı.
10. **EXIF yönü:** fotoğraf `<img>` ile çözülüp kanvasa çizilir; Safari yönü uygular. `createImageBitmap`’e geçmeyin (sürümler arasında yön davranışı tutarsız).
11. **HEIC:** `accept="image/*"` ile iOS fotoğrafı JPEG’e çevirir. `accept`’e `image/heic` eklemeyin.
12. **Saydam PNG** beyaz zemine çizilir (yoksa siyah görünür).
13. Ekranları `display:none` ile gizlemeyin (§4.2).

## 9. Sürüm yayınlama kontrol listesi

1. `node tests/run.mjs` çalıştırın; başarı oranı ve filtre çıktıları önceki sürümden kötü olmamalı.
2. Yeni dosya eklendiyse `sw.js` → `FILES`.
3. `sw.js` → `VERSION` (ör. `zeko-tara-v1.0.1`) ve `js/app.js` → `VERSION` (Uygulama bilgisi sayfasında görünür) artırın.
4. Değişen dosyaları GitHub’a yükleyin (README → “GitHub Pages’te yayınlama”).
5. iPhone’da uygulamayı açın → “Yeni sürüm hazır → Yenile” → README test listesinin ilgili maddeleri.
6. IndexedDB şeması değiştiyse eski verilerle açılışı mutlaka deneyin.

## 10. Yol haritası ve fikirler

Öncelik sırasıyla. ⚑ işaretli olanlar kullanıcının kararını gerektirir; başlamadan önce seçenekleri kısaca açıklayıp sorun.

### Kısa vade

- **Gerçek iPhone fotoğraflarıyla doğrulama ve ayar:**
  - 20–30 gerçek fotoğraf toplayın: farklı zeminler, ışık, el ile tutma, kısmen kadraj dışı.
  - Elle işaretlenmiş köşelerle bir test kümesi oluşturun.
  - Node’da JPEG çözücü yok; fotoğrafları PNG’ye çevirin ya da testi tarayıcıda çalıştırın.
  - Algılama eşiklerini bu kümeye göre ayarlayın.
- **Uçtan uca testleri depoya eklemek** (§7.2’deki betikler). İsteğe bağlı olarak GitHub Actions ile her yüklemede `node tests/run.mjs`.
- **Dosya boyutu / kalite seçeneği ⚑:** dışa aktarırken Yüksek / Dengeli / Küçük.
  - Ör. Dengeli: uzun kenar 2339 px (200 dpi), JPEG q 0.75.
  - Siyah-beyaz sayfalar gri ya da 1 bit FlateDecode olarak gömülebilir. `CompressionStream('deflate')` zlib biçimi üretir ve PDF FlateDecode ile uyumludur (Safari 16.4+). PDF’ler belirgin küçülür.
- **Ek görünümler:** Aydınlat, Gölgesiz, Mürekkep tasarrufu (Sihirli eklendi, 1.1.0); isteğe bağlı parlaklık/kontrast kaydırıcıları. Arka plan tahmini hazır olduğu için çoğu yalnızca eğri farkıdır.

### Orta vade

- **Yedekleme / geri yükleme ⚑:**
  - Uygulama ana ekrandan silinince belgeler kayboluyor.
  - Tüm belgeleri tek dosyaya (ör. JSON + JPEG’ler, zip) aktarıp geri yükleme.
  - Paylaşım menüsüyle Dosyalar’a kaydedilebilir.
- **Belge yönetimi:**
  - Arama (başlık), sıralama ölçütü, klasörler.
  - Belge birleştirme/bölme, sayfayı başka belgeye taşıma.
  - Çoklu seçimle toplu silme.
- **Kırpma ekranı:** iki parmakla yakınlaştırma; döndürmeyi kırpma ekranına da ekleme; yatay fotoğrafta daha büyük gösterim.
- **Uygulama içi canlı kamera ⚑:**
  - `getUserMedia` ile canlı kenar gösterimi, sabit tutunca otomatik çekim, art arda çok sayfa.
  - Ödünler (ilk kararda bu yüzden iOS kamerası seçildi): çözünürlük genelde düşük, flaş kontrolü sınırlı, ana ekran uygulamasında izin sorusu sık çıkabilir.
  - Mevcut iOS kamerası seçeneği korunmalı.
- **Algılama iyileştirmeleri:**
  - Üst üste kağıtlar, beyaz zemin, açık kitapta iki sayfayı bölme.
  - Kenarı görünmeyen belgede, renk/parlaklık bölgesinden ikinci bir aday üretici.

### Uzun vade

- **OCR / aranabilir PDF ⚑:** cihazda yapılmalı (ör. Tesseract.js + Türkçe dil verisi). Birkaç MB indirme ve iPhone’da yavaş işlem demek; ayrı, isteğe bağlı bir indirme olarak düşünün.
- **Kimlik kartı modu** (iki yüz tek sayfada), imza ekleme, sayfaya not.
- **Açık tema ⚑** (kullanıcı şimdilik hep koyu seçti), iPad düzeni.
- **Erişilebilirlik:** VoiceOver ve klavye ile kırpma köşelerine ince ayar (ok tuşlarıyla piksel kaydırma).
- **iOS açılış ekranları** (`apple-touch-startup-image`, cihaz boyutu başına bir görsel).

## 11. Kod stili

- Derleme yok: tarayıcının doğrudan yüklediği ES modülleri; harici kütüphane yok.
- 2 boşluk girinti, tek tırnak, noktalı virgül, satır ≤ ~120 karakter.
- Yorumlar Türkçe ve “neden”i anlatır. Arayüz metinleri Türkçe ve kısa.
- `js/core/` DOM’dan bağımsız kalmalı. Yeni piksel işi oraya yazılıp `tests/run.mjs`’e eklenmeli.
- Kullanıcıya görünen hatalar `toast()` ile Türkçe verilir; ayrıntı `console.error`’a yazılır.
