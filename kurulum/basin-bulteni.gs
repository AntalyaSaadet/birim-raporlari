/**
 * Saadet Partisi Antalya İl Başkanlığı · Günlük Basın Bülteni servisi (site kutusu)
 * --------------------------------------------------------------------------------
 * Her saat başı (08:00–23:00, TSİ) Google Haberler'den 4 başlıkta haberleri toplar,
 * günlük dosyaya ekler ve ana sayfadaki "Günlük Basın Bülteni" kutusuna JSON olarak sunar.
 * Sabah PDF bülteni (Claude zamanlanmış görevi) bundan bağımsızdır ve aynen devam eder.
 *
 * KURULUM (antalyasaadet7@gmail.com hesabıyla):
 *  1. "kurulum" işlevini çalıştırın (izinleri onaylayın). Saatlik tetikleyiciyi kurar ve ilk taramayı yapar.
 *  2. Dağıt → Yeni dağıtım → Web uygulaması · Yürüten: Ben · Erişim: Herkes
 *  3. /exec adresi sitedeki AYAR.BULTEN_API ayarına yazılır.
 *
 * Okuma: ?dosya=son.json | ?dosya=arsiv.json | ?dosya=arsiv/YYYY-AA-GG.json
 */

var TZ = "Europe/Istanbul";
var KLASOR_ADI = "Basın Bülteni (site verisi) · Saadet Antalya";
var SAKLA_GUN = 60;

var ILCE = "Antalya|Muratpaşa|Konyaaltı|Kepez|Döşemealtı|Aksu|Alanya|Manavgat|Serik|Kemer|Kumluca|Finike|Kaş|Demre|Elmalı|Korkuteli|Gazipaşa|Gündoğmuş|İbradı|Akseki";
var R_ANTALYA = new RegExp("antalya|(^|[^a-zçğıöşüâîû])(" + ILCE + ")(?=$|[^a-zçğıöşüâîû])", "i");
var R_SAADET = /saadet|arıkan|ARIKAN/i;

/* Saadet Partisi mensuplarına uygun olmayan içerik: bu kelimeleri içeren başlıklar ve bu tür kaynaklar bültene alınmaz.
   Listeye ekleme/çıkarma yapılabilir (küçük harfle yazın). */
var YASAK_ONEK = ["alkol", "içki", "kumarhane", "kumar", "iddaa", "casino", "kumarhane", "piyango", "astroloji", "magazin",
  "bikini", "frikik", "dekolte", "transparan", "seksi", "cinsel", "erotik", "porno", "müstehcen", "çıplak", "striptiz",
  "survivor", "masterchef", "kısmetse", "gelinim olur", "güldür güldür", "dizi oyuncu", "dizisinin", "dizinin", "sezon finali",
  "reyting", "ünlü oyuncu", "ünlü şarkıcı", "ünlü sunucu", "ünlü çift", "aşk yaşa", "ayrılık", "boşan", "nikah masas", "düğün fotoğraf", "kırmızı halı",
  "uzak şehir", "yalı çapkını", "kızılcık şerbeti", "teşkilat dizi", "kuruluş osman", "sevgilisi", "öpüş", "aşk itiraf", "iç çamaşır", "playboy", "onlyfans"];
var YASAK_KELIME = ["bira", "biralar", "rakı", "şarap", "viski", "votka", "kokteyl", "bahis", "burç", "burcu", "burçlar", "fal",
  "aşk", "dizi", "dizisi", "diziler", "dizide", "show", "talk show", "şov", "mayo", "mayolu", "+18"];
var YASAK_KAYNAK = /magazin|kelebek|onedio|elle|vogue|cosmopolitan|ntv magazin|show tv|kanal d|star tv|tv8/i;
var HARF = "a-zçğıöşüâîû";
var R_YASAK = new RegExp("(^|[^" + HARF + "])(" + YASAK_ONEK.map(kacis_).join("|") + ")|(^|[^" + HARF + "])(" + YASAK_KELIME.map(kacis_).join("|") + ")(?=$|[^" + HARF + "])");
function kacis_(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function trKucuk_(x) { return String(x || "").replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase(); }
function uygunsuz_(baslik, kaynak) {
  if (YASAK_KAYNAK.test(kaynak || "")) return true;
  if (/saadet|arıkan|fatih tekin/.test(trKucuk_(baslik))) return false; // partinin bu konulardaki açıklamaları alınır
  return R_YASAK.test(trKucuk_(baslik));
}

var BOLUMLER = [
  { baslik: "SAADET PARTİSİ ANTALYA", sinir: 15, uygun: function (b) { return /Fatih Tekin/i.test(b) || (R_SAADET.test(b) && R_ANTALYA.test(b)); }, sorgular: [
      '"Saadet Partisi" Antalya',
      '"Mehmet Fatih Tekin"',
      '"Saadet Partisi" (Alanya OR Manavgat OR Kepez OR Muratpaşa OR Konyaaltı OR Serik OR Kumluca OR Aksu OR Döşemealtı OR Gazipaşa OR Finike OR Kemer)'
  ]},
  { baslik: "SAADET PARTİSİ GENEL MERKEZ", sinir: 8, uygun: function (b) { return R_SAADET.test(b); }, sorgular: [
      '"Mahmut Arıkan"',
      '"Saadet Partisi"'
  ]},
  { baslik: "ANTALYA YEREL GÜNDEMİ", sinir: 10, uygun: function (b) { return R_ANTALYA.test(b); }, sorgular: [
      '"Antalya Büyükşehir"',
      'Antalya Valiliği OR "Antalya Valisi"',
      'Antalya'
  ]},
  { baslik: "TÜRKİYE GÜNDEMİ", sinir: 8, sorgular: [ null ] } // null = Google Haberler "Türkiye" bölümü
];

/* ---------------- kurulum ---------------- */
function kurulum() {
  klasor_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "topla") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("topla").timeBased().everyHours(1).nearMinute(0).create(); // saat başı (Google ±15 dk oynatabilir)
  bugunuYenile();   // bugünün bültenini baştan toplar
  Logger.log("Kurulum tamam. Son bülten: " + JSON.stringify(oku_("son.json")).slice(0, 300));
}

/* Bugünün bültenini sıfırlayıp yeniden toplar (gerektiğinde elle çalıştırılır) */
function bugunuYenile() {
  sil_("arsiv/" + Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd") + ".json");
  topla(true);
  Logger.log(JSON.stringify(oku_("son.json")).slice(0, 1500));
}

/* ---------------- toplama ---------------- */
function topla(zorla) {
  var simdi = new Date();
  var saat = +Utilities.formatDate(simdi, TZ, "H");
  if (!zorla && (saat < 8 || saat > 23)) return;

  var gun = Utilities.formatDate(simdi, TZ, "yyyy-MM-dd");
  var b = oku_("arsiv/" + gun + ".json");
  var yeniGun = !b;
  if (!b) {
    b = { gun: gun, tarih: tarihYaz_(simdi), donem: "Dün 08.00'den itibaren (TSİ)", guncelleme: "", pdf: "", one_cikanlar: [],
          bolumler: BOLUMLER.map(function (x) { return { baslik: x.baslik, haberler: [] }; }) };
  }
  // Tarama başlangıcı: dün 08:00 (TSİ)
  var dun = new Date(simdi.getTime() - 24 * 3600 * 1000);
  var bas = istanbulTarih_(Utilities.formatDate(dun, TZ, "yyyy-MM-dd"), 8);
  var eklenme = yeniGun ? "08.00" : Utilities.formatDate(simdi, TZ, "HH") + ".00";

  var gorulen = {};
  b.bolumler.forEach(function (bl) { (bl.haberler || []).forEach(function (h) { gorulen[anahtar_(h.baslik)] = 1; (h.mecralar || []).forEach(function (m) { if (m.url) gorulen[m.url] = 1; }); }); });

  BOLUMLER.forEach(function (tanim, i) {
    var bl = b.bolumler[i] || (b.bolumler[i] = { baslik: tanim.baslik, haberler: [] });
    var adaylar = [];
    tanim.sorgular.forEach(function (q) { adaylar = adaylar.concat(rss_(q)); });
    adaylar.sort(function (x, y) { return y.t - x.t; });
    var yeni = [];
    adaylar.forEach(function (a) {
      if (a.t < bas.getTime() || a.t > simdi.getTime() + 600000) return;
      if (tanim.uygun && !tanim.uygun(a.baslik)) return;
      if (uygunsuz_(a.baslik, a.kaynak)) return;
      var k = anahtar_(a.baslik);
      if (!k || gorulen[k] || gorulen[a.url]) return;
      gorulen[k] = 1; gorulen[a.url] = 1;
      yeni.push({ baslik: a.baslik, ozet: "", mecralar: [{ ad: a.kaynak, site: a.site, url: a.url, zaman: Utilities.formatDate(new Date(a.t), TZ, "dd.MM.yyyy, HH.mm") }], eklenme: eklenme });
    });
    bl.haberler = yeni.concat(bl.haberler || []).slice(0, tanim.sinir);
  });

  b.guncelleme = Utilities.formatDate(simdi, TZ, "yyyy-MM-dd'T'HH:mm:ss") + "+03:00";
  yaz_("arsiv/" + gun + ".json", b);
  yaz_("son.json", b);

  var arsiv = oku_("arsiv.json") || [];
  arsiv = arsiv.filter(function (x) { return x.gun !== gun; });
  arsiv.unshift({ gun: gun, tarih: b.tarih, pdf: "", json: "arsiv/" + gun + ".json" });
  var silinecek = arsiv.slice(SAKLA_GUN);
  arsiv = arsiv.slice(0, SAKLA_GUN);
  yaz_("arsiv.json", arsiv);
  silinecek.forEach(function (x) { sil_(x.json); });
}

function rss_(q) {
  var url = q === null
    ? "https://news.google.com/rss/headlines/section/topic/NATION?hl=tr&gl=TR&ceid=TR:tr"
    : "https://news.google.com/rss/search?q=" + encodeURIComponent(q + " when:2d") + "&hl=tr&gl=TR&ceid=TR:tr";
  try {
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return [];
    var kanal = XmlService.parse(r.getContentText()).getRootElement().getChild("channel");
    return kanal.getChildren("item").map(function (it) {
      var kaynak = it.getChildText("source") || "";
      var kEl = it.getChild("source"), kUrl = "";
      try { kUrl = kEl && kEl.getAttribute("url") ? kEl.getAttribute("url").getValue() : ""; } catch (x) {}
      var baslik = (it.getChildText("title") || "").trim();
      if (kaynak && baslik.slice(-(kaynak.length + 3)) === " - " + kaynak) baslik = baslik.slice(0, -(kaynak.length + 3)).trim();
      return { baslik: baslik, kaynak: kaynak || "Google Haberler", site: kUrl, url: it.getChildText("link") || "", t: new Date(it.getChildText("pubDate")).getTime() || 0 };
    }).filter(function (x) { return x.baslik && x.url && x.t; });
  } catch (e) { return []; }
}

/* ---------------- okuma (site) ---------------- */
function doGet(e) {
  var dosya = (e && e.parameter && e.parameter.dosya) || "son.json";
  if (!/^(son\.json|arsiv\.json|arsiv\/\d{4}-\d{2}-\d{2}\.json)$/.test(dosya)) return json_({ hata: "gecersiz" });
  var v = oku_(dosya);
  if (v === null) return json_({ hata: "yok", dosya: dosya });
  return json_(v);
}

/* ---------------- yardımcılar ---------------- */
function klasor_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("KLASOR_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  var k = DriveApp.createFolder(KLASOR_ADI);
  p.setProperty("KLASOR_ID", k.getId());
  return k;
}
function dosyaAdi_(yol) { return yol.replace("/", "_"); }
function oku_(yol) {
  var it = klasor_().getFilesByName(dosyaAdi_(yol));
  if (!it.hasNext()) return null;
  try { return JSON.parse(it.next().getBlob().getDataAsString("UTF-8")); } catch (e) { return null; }
}
function yaz_(yol, veri) {
  var ad = dosyaAdi_(yol), k = klasor_(), it = k.getFilesByName(ad), metin = JSON.stringify(veri);
  if (it.hasNext()) it.next().setContent(metin); else k.createFile(ad, metin, "application/json");
}
function sil_(yol) { var it = klasor_().getFilesByName(dosyaAdi_(yol)); while (it.hasNext()) it.next().setTrashed(true); }
function anahtar_(s) { return String(s || "").toLowerCase().replace(/[^a-zçğıöşü0-9]+/g, " ").trim().slice(0, 90); }
function istanbulTarih_(ymd, saat) { return new Date(ymd + "T" + (saat < 10 ? "0" : "") + saat + ":00:00+03:00"); }
function tarihYaz_(d) {
  var aylar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  var gunler = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  var g = +Utilities.formatDate(d, TZ, "d"), a = +Utilities.formatDate(d, TZ, "M"), y = Utilities.formatDate(d, TZ, "yyyy"), hg = +Utilities.formatDate(d, TZ, "u") % 7;
  return g + " " + aylar[a - 1] + " " + y + " " + gunler[hg];
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
