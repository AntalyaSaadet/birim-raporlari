/**
 * Saadet Partisi Antalya İl Başkanlığı · Ziyaret Kayıt Servisi (isimsiz ziyaretçi istatistikleri)
 * ---------------------------------------------------------------------------------------------
 * Site sayfalarından gelen olayları (sayfa görüntüleme, süre, bölüm görünme, tıklama) bir Google
 * E-Tablo'ya yazar ve "Ayrıntılı rapor › Ziyaretçi İstatistikleri" sekmesi için özet üretir.
 * Kişi adı, IP adresi ya da konum KAYDEDİLMEZ; ziyaretçi numarası tarayıcıda rastgele üretilir.
 *
 * KURULUM (antalyasaadet7@gmail.com hesabıyla):
 *  1. "kurulum" işlevini çalıştırın (izinleri onaylayın). Kayıt tablosunu oluşturur ve günlük temizliği kurar.
 *  2. Dağıt → Yeni dağıtım → Web uygulaması · Yürüten: Ben · Erişim: Herkes
 *  3. /exec adresi sitedeki AYAR.ZIYARET_API ayarına yazılır.
 */

var TZ = "Europe/Istanbul";
var SAKLA_GUN = 400;            // bu süreden eski kayıtlar her gece silinir
var BASLIK = ["Zaman", "Gün", "Ziyaretçi", "Oturum", "Sayfa", "Olay", "Ad", "Süre (sn)", "İlk", "Kaynak", "Cihaz"];

function kurulum() {
  tablo_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "temizle") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("temizle").timeBased().everyDays(1).atHour(4).create();
  Logger.log("Kurulum tamam. Kayıt tablosu: " + SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TABLO_ID")).getUrl());
}

/* ---------------- kayıt ---------------- */
function doPost(e) {
  try {
    var v = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var z = kisa_(v.z, 24), o = kisa_(v.o, 24);
    if (!/^[a-z0-9]{6,24}$/.test(z) || !/^[a-z0-9]{6,24}$/.test(o)) return metin_("gecersiz");
    var olaylar = Array.isArray(v.e) ? v.e.slice(0, 80) : [];
    var simdi = new Date(), gun = Utilities.formatDate(simdi, TZ, "yyyy-MM-dd"), zaman = Utilities.formatDate(simdi, TZ, "yyyy-MM-dd HH:mm:ss");
    var sayfa = kisa_(v.p, 40), kaynak = kisa_(v.k, 50), cihaz = kisa_(v.c, 20);
    var satirlar = olaylar.filter(function (x) { return /^(sayfa|sure|bolum|tik)$/.test(x && x.t); }).map(function (x) {
      return [zaman, gun, z, o, sayfa, x.t, kisa_(x.a, 60), Math.max(0, Math.min(+x.s || 0, 4 * 3600)), x.y ? 1 : 0, kaynak, cihaz];
    });
    if (!satirlar.length) return metin_("bos");
    var kilit = LockService.getScriptLock(); kilit.waitLock(10000);
    try { var sh = tablo_(); sh.getRange(sh.getLastRow() + 1, 1, satirlar.length, BASLIK.length).setValues(satirlar); }
    finally { kilit.releaseLock(); }
    CacheService.getScriptCache().remove("ozet_7"); CacheService.getScriptCache().remove("ozet_30");
    return metin_("ok");
  } catch (err) { return metin_("hata"); }
}

/* ---------------- özet ---------------- */
function doGet(e) {
  var islem = (e && e.parameter && e.parameter.islem) || "durum";
  if (islem !== "ozet") return json_({ ok: true, servis: "ziyaret-kaydi" });
  var gun = Math.max(1, Math.min(+(e.parameter.gun) || 30, 365));
  var c = CacheService.getScriptCache(), k = "ozet_" + gun, v = c.get(k);
  if (v) return ContentService.createTextOutput(v).setMimeType(ContentService.MimeType.JSON);
  v = JSON.stringify(ozet_(gun));
  try { c.put(k, v, 120); } catch (x) {}
  return ContentService.createTextOutput(v).setMimeType(ContentService.MimeType.JSON);
}

function ozet_(gunSay) {
  var sh = tablo_(), n = sh.getLastRow() - 1;
  var bas = Utilities.formatDate(new Date(Date.now() - (gunSay - 1) * 86400000), TZ, "yyyy-MM-dd");
  var R = n > 0 ? sh.getRange(2, 1, n, BASLIK.length).getValues() : [];
  var gunler = {}, ziy = {}, otr = {}, sayfa = {}, bolum = {}, tik = {}, ilkGorulme = {};
  // ziyaretçinin ilk görüldüğü gün (geri dönen ziyaretçi hesabı için tüm kayıtlar taranır)
  R.forEach(function (r) { var g = gunYaz_(r[1]), zz = r[2]; if (!ilkGorulme[zz] || g < ilkGorulme[zz]) ilkGorulme[zz] = g; });
  R.forEach(function (r) {
    var g = gunYaz_(r[1]); if (g < bas) return;
    var zz = r[2], oo = r[3], sp = r[4], t = r[5], ad = r[6], s = +r[7] || 0, kay = r[9], cih = r[10];
    var G = gunler[g] || (gunler[g] = { z: {}, o: {}, sayfa: 0 });
    G.z[zz] = 1; G.o[oo] = 1;
    var Z = ziy[zz] || (ziy[zz] = { o: {} }); Z.o[oo] = 1;
    var O = otr[oo] || (otr[oo] = { kaynak: kay, cihaz: cih, sure: 0, sayfa: 0, z: zz });
    if (t === "sayfa") { G.sayfa++; O.sayfa++; var S = sayfa[sp] || (sayfa[sp] = { goruntuleme: 0, sure: 0 }); S.goruntuleme++; }
    else if (t === "sure") { O.sure += s; var S2 = sayfa[sp] || (sayfa[sp] = { goruntuleme: 0, sure: 0 }); S2.sure += s; }
    else if (t === "bolum") { var B = bolum[ad] || (bolum[ad] = { gorulme: 0, sure: 0 }); B.gorulme += +r[8] ? 1 : 0; B.sure += s; }
    else if (t === "tik") { tik[ad] = (tik[ad] || 0) + 1; }
  });
  // bölüm "yeni" bilgisi 9. sütunda (Yeni oturum sütunu bölüm olayında "ilk görünme" anlamında kullanılır)
  var oturumlar = Object.keys(otr), ziyaretciler = Object.keys(ziy);
  var geriDonen = ziyaretciler.filter(function (zz) { return Object.keys(ziy[zz].o).length > 1 || ilkGorulme[zz] < bas; }).length;
  var topSure = oturumlar.reduce(function (t, x) { return t + otr[x].sure; }, 0);
  var say = function (alan) { var m = {}; oturumlar.forEach(function (x) { var a = otr[x][alan] || "Bilinmiyor"; m[a] = (m[a] || 0) + 1; }); return m; };
  var gunListe = [];
  for (var i = gunSay - 1; i >= 0; i--) {
    var g = Utilities.formatDate(new Date(Date.now() - i * 86400000), TZ, "yyyy-MM-dd"), G = gunler[g];
    gunListe.push({ gun: g, ziyaretci: G ? Object.keys(G.z).length : 0, ziyaret: G ? Object.keys(G.o).length : 0, goruntuleme: G ? G.sayfa : 0 });
  }
  return {
    ok: true, gun: gunSay, baslangic: bas, guncelleme: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss") + "+03:00",
    toplam: { ziyaretci: ziyaretciler.length, ziyaret: oturumlar.length, goruntuleme: oturumlar.reduce(function (t, x) { return t + otr[x].sayfa; }, 0),
              geriDonen: geriDonen, ortSure: oturumlar.length ? Math.round(topSure / oturumlar.length) : 0 },
    gunler: gunListe,
    sayfalar: Object.keys(sayfa).map(function (k) { var S = sayfa[k]; return { ad: k, goruntuleme: S.goruntuleme, ortSure: S.goruntuleme ? Math.round(S.sure / S.goruntuleme) : 0 }; }),
    bolumler: Object.keys(bolum).map(function (k) { var B = bolum[k]; return { ad: k, gorulme: B.gorulme, ortSure: B.gorulme ? Math.round(B.sure / B.gorulme) : 0 }; }),
    tiklamalar: Object.keys(tik).map(function (k) { return { ad: k, sayi: tik[k] }; }),
    kaynaklar: say("kaynak"), cihazlar: say("cihaz")
  };
}

/* ---------------- bakım ---------------- */
function temizle() {
  var sh = tablo_(), n = sh.getLastRow() - 1; if (n < 1) return;
  var sinir = Utilities.formatDate(new Date(Date.now() - SAKLA_GUN * 86400000), TZ, "yyyy-MM-dd");
  var gunler = sh.getRange(2, 2, n, 1).getValues(), sil = 0;
  while (sil < n && gunYaz_(gunler[sil][0]) < sinir) sil++;
  if (sil) sh.deleteRows(2, sil);
}
/* Tüm kayıtları siler (deneme sonrası sıfırlamak için elle çalıştırılır) */
function hepsiniSil() { var sh = tablo_(); if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1); CacheService.getScriptCache().removeAll(["ozet_7", "ozet_30"]); }

/* ---------------- yardımcılar ---------------- */
function tablo_() {
  var p = PropertiesService.getScriptProperties(), id = p.getProperty("TABLO_ID"), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Ziyaretçi Kayıtları (isimsiz) · Saadet Antalya Sitesi");
    var sh0 = ss.getSheets()[0]; sh0.setName("Olaylar"); sh0.appendRow(BASLIK); sh0.setFrozenRows(1);
    p.setProperty("TABLO_ID", ss.getId());
  }
  return ss.getSheetByName("Olaylar");
}
function gunYaz_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, "yyyy-MM-dd") : String(v); }
function kisa_(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001F]/g, "").trim().slice(0, n); }
function metin_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.TEXT); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
