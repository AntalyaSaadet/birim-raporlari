/**
 * Saadet Partisi Antalya İl Başkanlığı · "Bize Yazın" e-posta servisi
 * ------------------------------------------------------------------
 * Ana sayfadaki "Bize Yazın" formundan gelen mesajları
 * antalyasaadet7@gmail.com adresine e-posta olarak gönderir ve
 * bir Google E-Tablo'ya kaydeder.
 *
 * KURULUM (antalyasaadet7@gmail.com hesabıyla):
 * 1. script.google.com → Yeni proje → adı: "Bize Yazın Servisi"
 * 2. Bu dosyanın tamamını yapıştırıp kaydedin.
 * 3. Üstten "kurulum" işlevini seçip ▶ Çalıştır'a basın, izinleri onaylayın
 *    (e-posta gönderme ve E-Tablo oluşturma izni ister).
 * 4. Dağıt → Yeni dağıtım → Tür: Web uygulaması
 *      Yürüten: Ben (antalyasaadet7@gmail.com)
 *      Erişimi olan: Herkes
 * 5. Verilen "/exec" ile biten adresi kopyalayıp Claude'a iletin;
 *    sayfadaki BIZE_YAZIN_URL ayarına yazılacak.
 *
 * Mevcut 8 Nolu Rapor ve Eğitim sistemlerinden tamamen bağımsızdır.
 */

var ALICI = "antalyasaadet7@gmail.com";
var GUNLUK_SINIR_KISI = 5;   // aynı e-posta adresinden günde en fazla mesaj
var GUNLUK_SINIR_TOPLAM = 80; // tüm formdan günde en fazla mesaj (Gmail kotasını korur)

function kurulum() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty("TABLO_ID")) {
    var ss = SpreadsheetApp.create("Bize Yazın · Gelen Mesajlar (Saadet Antalya)");
    var sh = ss.getSheets()[0];
    sh.setName("Mesajlar");
    sh.appendRow(["Zaman", "Ad Soyad", "E-posta", "Telefon", "İlçe", "Konu", "Mesaj", "Sayfa", "Durum"]);
    sh.setFrozenRows(1);
    p.setProperty("TABLO_ID", ss.getId());
  }
  Logger.log("Kurulum tamam. Kayıt tablosu: https://docs.google.com/spreadsheets/d/" + p.getProperty("TABLO_ID"));
}

function doGet(e) {
  return json_({ ok: true, servis: "bize-yazin", alici: ALICI, kalanKota: MailApp.getRemainingDailyQuota() });
}

function doPost(e) {
  try {
    var v = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (v.web) return json_({ ok: true }); // bot tuzağı: sessizce yok say

    var ad = temiz_(v.ad, 80), eposta = temiz_(v.eposta, 120), tel = temiz_(v.telefon, 20),
        ilce = temiz_(v.ilce, 40), konu = temiz_(v.konu, 60), mesaj = temiz_(v.mesaj, 3000), sayfa = temiz_(v.kaynak, 300);
    if (ad.length < 3) return json_({ ok: false, hata: "Ad soyad eksik." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) return json_({ ok: false, hata: "E-posta adresi geçersiz." });
    if (!konu) return json_({ ok: false, hata: "Konu seçilmedi." });
    if (mesaj.length < 10) return json_({ ok: false, hata: "Mesaj çok kısa." });

    var cache = CacheService.getScriptCache();
    var kAnahtar = "k_" + eposta.toLowerCase(), tAnahtar = "toplam_" + Utilities.formatDate(new Date(), "Europe/Istanbul", "yyyyMMdd");
    var kSay = +(cache.get(kAnahtar) || 0), tSay = +(cache.get(tAnahtar) || 0);
    if (kSay >= GUNLUK_SINIR_KISI || tSay >= GUNLUK_SINIR_TOPLAM) return json_({ ok: false, hata: "Bugün için mesaj sınırına ulaşıldı." });

    var konuSatiri = "[Bize Yazın] " + konu + " · " + ad + (ilce ? " (" + ilce + ")" : "");
    var govde =
      "<div style='font-family:Arial,sans-serif;font-size:14px;color:#1d1b19'>" +
      "<h2 style='color:#cd272d;margin:0 0 10px'>Yeni mesaj · Bize Yazın</h2>" +
      "<table cellpadding='6' style='border-collapse:collapse'>" +
      satir_("Ad Soyad", ad) + satir_("E-posta", eposta) + satir_("Telefon", tel || "—") +
      satir_("İlçe", ilce || "—") + satir_("Konu", konu) + "</table>" +
      "<p style='white-space:pre-wrap;background:#f6f4f1;padding:12px;border-radius:8px'>" + html_(mesaj) + "</p>" +
      "<p style='color:#7d776f;font-size:12px'>Bu mesaj Saadet Partisi Antalya ana sayfasındaki \"Bize Yazın\" formundan gönderildi. Yanıtla dediğinizde gönderene ulaşır.</p></div>";

    var durum = "gönderildi";
    try {
      MailApp.sendEmail({ to: ALICI, replyTo: eposta, subject: konuSatiri, htmlBody: govde, name: "Saadet Antalya · Bize Yazın" });
    } catch (mailHata) { durum = "e-posta hatası: " + mailHata.message; }

    var id = PropertiesService.getScriptProperties().getProperty("TABLO_ID");
    if (id) {
      try {
        SpreadsheetApp.openById(id).getSheetByName("Mesajlar").appendRow([new Date(), ad, eposta, tel, ilce, konu, mesaj, sayfa, durum]);
      } catch (tabloHata) {}
    }

    if (durum !== "gönderildi") return json_({ ok: false, hata: "Mesaj kaydedildi ancak e-posta gönderilemedi." });
    cache.put(kAnahtar, String(kSay + 1), 86400);
    cache.put(tAnahtar, String(tSay + 1), 86400);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, hata: "Beklenmeyen hata." });
  }
}

function temiz_(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, n); }
function html_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function satir_(a, b) { return "<tr><td style='color:#7d776f'>" + html_(a) + "</td><td><b>" + html_(b) + "</b></td></tr>"; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
