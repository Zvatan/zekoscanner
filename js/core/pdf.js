// JPEG sayfalardan PDF üreten küçük yazıcı. JPEG'ler yeniden sıkıştırılmadan
// DCTDecode akışı olarak gömülür. DOM kullanmaz.

const A4 = { w: 595.28, h: 841.89 };

// JPEG başlığından genişlik, yükseklik ve kanal sayısını okur.
export function jpegInfo(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('JPEG değil');
  let i = 2;
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components: bytes[i + 9],
      };
    }
    i += 2 + len;
  }
  throw new Error('JPEG boyutu okunamadı');
}

// PDF metin dizesi: Türkçe karakterler için BOM'lu UTF-16BE onaltılık.
function pdfText(s) {
  let hex = 'FEFF';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0');
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0');
    } else {
      hex += code.toString(16).padStart(4, '0');
    }
  }
  return '<' + hex.toUpperCase() + '>';
}

function pdfDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `(D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())})`;
}

function num(n) {
  return (Math.round(n * 100) / 100).toString();
}

// Sayfa boyutu: 'auto' görüntü oranını korur (uzun kenar A4 boyu),
// 'a4' görüntüyü A4 sayfaya ortalayarak sığdırır.
function pageLayout(info, pageSize) {
  const landscape = info.width > info.height;
  if (pageSize === 'a4') {
    const pw = landscape ? A4.h : A4.w;
    const ph = landscape ? A4.w : A4.h;
    const s = Math.min(pw / info.width, ph / info.height);
    const iw = info.width * s;
    const ih = info.height * s;
    return { pw, ph, x: (pw - iw) / 2, y: (ph - ih) / 2, iw, ih };
  }
  const long = A4.h;
  const pw = landscape ? long : (long * info.width) / info.height;
  const ph = landscape ? (long * info.height) / info.width : long;
  return { pw, ph, x: 0, y: 0, iw: pw, ih: ph };
}

// pages: Uint8Array JPEG listesi. Uint8Array parçalarından oluşan dizi döner;
// tarayıcıda new Blob(parts, { type: 'application/pdf' }) ile kullanılır.
export function buildPdf(pages, { pageSize = 'auto', title = '', date = new Date() } = {}) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let pos = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    pos += bytes.length;
  };

  // Nesne numaraları: 1 katalog, 2 sayfa ağacı, 3 bilgi, sonra her sayfa
  // için görüntü, içerik ve sayfa nesneleri.
  const n = pages.length;
  const imgId = (i) => 4 + i * 3;
  const contentId = (i) => 5 + i * 3;
  const pageId = (i) => 6 + i * 3;
  const objCount = 3 + n * 3;

  const begin = (id) => {
    offsets[id] = pos;
    push(`${id} 0 obj\n`);
  };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // ikili dosya işareti

  begin(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  begin(2);
  const kids = pages.map((_, i) => `${pageId(i)} 0 R`).join(' ');
  push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>\nendobj\n`);

  begin(3);
  push(`<< /Title ${pdfText(title)} /Producer ${pdfText('Zeko Tara')} /CreationDate ${pdfDate(date)} >>\nendobj\n`);

  pages.forEach((jpeg, i) => {
    const info = jpegInfo(jpeg);
    const cs = info.components === 1 ? '/DeviceGray' : info.components === 4 ? '/DeviceCMYK' : '/DeviceRGB';
    begin(imgId(i));
    push(
      `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height} ` +
        `/ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
    );
    push(jpeg);
    push('\nendstream\nendobj\n');

    const L = pageLayout(info, pageSize);
    const content = `q ${num(L.iw)} 0 0 ${num(L.ih)} ${num(L.x)} ${num(L.y)} cm /Im0 Do Q`;
    begin(contentId(i));
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    begin(pageId(i));
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(L.pw)} ${num(L.ph)}] ` +
        `/Resources << /XObject << /Im0 ${imgId(i)} 0 R >> >> /Contents ${contentId(i)} 0 R >>\nendobj\n`,
    );
  });

  const xref = pos;
  let table = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= objCount; id++) table += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return parts;
}
