/**
 * Saadet Partisi Antalya İl Başkanlığı · saadet.org.tr Önbellek Servisi
 * ---------------------------------------------------------------------
 * Ana sayfa ve Parti Belgeleri sayfası saadet.org.tr verilerini (haberler, dosya arşivi, Saadet Çözer,
 * program, tüzük, il başkanı, sabitler) her ziyaretçide doğrudan saadet.org.tr'den istemek yerine bu
 * servisten okur. Servis veriyi saatte bir yeniler ve son başarılı kopyayı saklar; saadet.org.tr geçici
 * olarak erişilemez olsa bile site son kopyayı göstermeye devam eder.
 *
 * KURULUM (il başkanlığının Google hesabıyla):
 *  1. "kurulum" işlevini çalıştırın (izinleri onaylayın). Saatlik yenilemeyi kurar ve ilk verileri çeker.
 *  2. Dağıt → Yeni dağıtım → Web uygulaması · Yürüten: Ben · Erişim: Herkes
 *  3. /exec adresi sitedeki AYAR.SITE_ONBELLEK ayarına yazılır.
 */

var API = "https://admin.saadet.org.tr/veriler/api.php";
var IZINLI = ["haberler", "medya", "medya_kategori", "saadet_cozer_kategori", "program_kategori", "program",
              "tuzuk_kategori", "tuzuk", "il_baskanlari", "sabitler"];
var TAZE_DK = 60;          // bu süreden yeni kopya varsa saadet.org.tr'ye gidilmez
var KLASOR_ADI = "saadet.org.tr önbelleği (site verisi) · Saadet Antalya";

/* Ana sayfanın her açılışta istediği sabit sorgular (saatlik yenilemede önceden doldurulur) */
var ON_YUKLE = [   // anahtarlar: önce resource, sonra alfabetik (sorgu_ ile aynı sıra)
  "resource=haberler&anasayfa=1&include_slug=1&lang=1&limit=10",
  "resource=medya_kategori&lang=1",
  "resource=saadet_cozer_kategori&include_slug=1&lang=1",
  "resource=program_kategori&lang=1",
  "resource=tuzuk_kategori&lang=1",
  "resource=il_baskanlari&il_id=7&lang=1&limit=1",
  "resource=sabitler&lang=1&limit=1"
];

function kurulum() {
  klasor_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "yenile") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("yenile").timeBased().everyHours(1).create();
  yenile();
  Logger.log("Kurulum tamam. Durum: " + JSON.stringify(durum_()));
}

/* Saatlik: ön yüklenen sorgular + son 3 günde istenmiş diğer sorgular yenilenir */
function yenile() {
  var p = PropertiesService.getScriptProperties();
  var kullanilan = JSON.parse(p.getProperty("KULLANILAN") || "{}"), sinir = Date.now() - 3 * 86400000, liste = ON_YUKLE.slice();
  Object.keys(kullanilan).forEach(function (q) { if (kullanilan[q] < sinir) delete kullanilan[q]; else if (liste.indexOf(q) < 0) liste.push(q); });
  p.setProperty("KULLANILAN", JSON.stringify(kullanilan));
  var basarili = 0, hata = "";
  liste.slice(0, 60).forEach(function (q) { var s = cek_(q); if (s.ok) basarili++; else hata = s.hata; });
  p.setProperty("SON_YENILEME", JSON.stringify({ zaman: new Date().toISOString(), basarili: basarili, toplam: Math.min(liste.length, 60), hata: hata }));
}

/* ---------------- site okuma ---------------- */
function doGet(e) {
  var prm = (e && e.parameter) || {};
  if (prm.islem === "durum") return json_(durum_());
  var kaynak = prm.resource;
  if (IZINLI.indexOf(kaynak) < 0) return json_({ sonuc: 0, mesaj: "izinsiz kaynak" });
  var q = sorgu_(prm);
  kaydetKullanim_(q);
  var kayit = oku_(q);
  if (!kayit || Date.now() - kayit.t > TAZE_DK * 60000) {
    var s = cek_(q);
    if (s.ok) kayit = s.kayit;
  }
  if (!kayit) return json_({ sonuc: 0, mesaj: "saadet.org.tr şu an okunamıyor ve kayıtlı kopya yok" });
  return ContentService.createTextOutput(kayit.v).setMimeType(ContentService.MimeType.JSON);
}

/* ---------------- yardımcılar ---------------- */
function cek_(q) {
  try {
    var r = UrlFetchApp.fetch(API + "?" + q, { muteHttpExceptions: true, followRedirects: true, headers: { "Accept": "application/json" } });
    var metin = r.getContentText("UTF-8");
    if (r.getResponseCode() !== 200) return { ok: false, hata: "HTTP " + r.getResponseCode() };
    try { JSON.parse(metin); } catch (x) { return { ok: false, hata: "JSON değil (güvenlik sayfası olabilir)" }; }
    var kayit = { t: Date.now(), v: metin };
    yaz_(q, kayit);
    return { ok: true, kayit: kayit };
  } catch (err) { return { ok: false, hata: String(err.message || err).slice(0, 120) }; }
}
function sorgu_(prm) {
  var anahtarlar = Object.keys(prm).filter(function (k) { return k !== "_" && k !== "islem"; }).sort(function (a, b) { return a === "resource" ? -1 : b === "resource" ? 1 : a < b ? -1 : 1; });
  return anahtarlar.map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(String(prm[k]).slice(0, 60)); }).join("&");
}
function kaydetKullanim_(q) {
  if (ON_YUKLE.indexOf(q) >= 0) return;
  var c = CacheService.getScriptCache(); if (c.get("k_" + ozet_(q))) return; c.put("k_" + ozet_(q), "1", 6 * 3600);
  var kilit = LockService.getScriptLock(); if (!kilit.tryLock(3000)) return;
  try { var p = PropertiesService.getScriptProperties(), m = JSON.parse(p.getProperty("KULLANILAN") || "{}"); m[q] = Date.now(); p.setProperty("KULLANILAN", JSON.stringify(m)); }
  finally { kilit.releaseLock(); }
}
function durum_() {
  var p = PropertiesService.getScriptProperties();
  return { ok: true, servis: "site-onbellek", son: JSON.parse(p.getProperty("SON_YENILEME") || "null") };
}
function klasor_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("KLASOR_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var k = DriveApp.createFolder(KLASOR_ADI); p.setProperty("KLASOR_ID", k.getId()); return k;
}
function ozet_(q) { return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, q).map(function (b) { return ("0" + (b & 255).toString(16)).slice(-2); }).join(""); }
function oku_(q) {
  var c = CacheService.getScriptCache(), ad = "v_" + ozet_(q), h = c.get(ad);
  if (h) { try { return JSON.parse(h); } catch (e) {} }
  var it = klasor_().getFilesByName(ad + ".json");
  if (!it.hasNext()) return null;
  try { var k = JSON.parse(it.next().getBlob().getDataAsString("UTF-8")); try { c.put(ad, JSON.stringify(k), 600); } catch (x) {} return k; } catch (e) { return null; }
}
function yaz_(q, kayit) {
  var ad = "v_" + ozet_(q), k = klasor_(), it = k.getFilesByName(ad + ".json"), metin = JSON.stringify(kayit);
  if (it.hasNext()) it.next().setContent(metin); else k.createFile(ad + ".json", metin, "application/json");
  try { CacheService.getScriptCache().put(ad, metin, 600); } catch (x) {}   // 100 KB'tan büyükse yalnızca Drive'da tutulur
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
