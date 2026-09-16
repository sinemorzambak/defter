// Defter AI — ödeme planı yorumcusu
//
// Tüm matematik tarayıcıda, deterministik olarak yapılır. Bu fonksiyon sadece
// hazır hesaplanmış senaryoları alıp anlaşılır bir dille açıklar; model kendi
// rakamını üretmez. Anahtar sunucuda kalır (provider.ts — Gemini/Groq ücretsiz).
// Hiç anahtar yoksa 501 döner ve uygulama kendi şablon yorumunu gösterir.
//
// Kurulum (ücretsiz):
//   supabase secrets set GEMINI_API_KEY=...      # aistudio.google.com
//   supabase functions deploy defter-ai

import { callModel, CORS, json, activeProvider } from "./provider.ts";

const SYSTEM = `Sen "Defter" adlı kişisel finans uygulamasının açıklayıcısısın.
Kullanıcı Türkçe konuşuyor. Uzun vadeli bir plan yürütüyor: önce borçları
kapatmak, sonra aynı aylık tutarı birikim hedeflerine (örneğin ev peşinatı)
kaydırmak. Uygulama bunu tek bir zaman çizgisi olarak simüle ediyor.

Sana hazır hesaplanmış sonuçlar veriliyor: senaryoların kaç ay sürdüğü, toplam
faiz, borçsuz kalma tarihi ve her hedefin tahmini tamamlanma tarihi. Hepsi
uygulamanın kendi simülasyonundan geliyor.

Kuralların:
- ASLA yeni rakam uydurma, hesap yapma veya tahmin etme. Sadece sana verilen
  sayıları ve tarihleri kullan; gerekiyorsa aralarındaki farkı belirt.
- Getiri varsayımı kullanıcının kendi girdiği bir sayıdır. Onu "beklenen getiri"
  gibi sunma, "senin girdiğin varsayımla" diye çerçevele. Varsayım yüksekse
  (yıllık %25 üstü) bunun iyimser bir varsayım olduğunu tek cümleyle belirt.
- Sadece kullanıcının girdiği borçlar ve hedefler arasında para dağıtımı öner.
- Yatırım aracı, kredi, borç birleştirme, kripto, hisse, fon, döviz, altın gibi
  ÜRÜN veya ARAÇ önerme ve bunlara yönlendirme. "Nereye yatırayım", "hangi fon",
  "ev almalı mıyım" gibi sorularda: bunun bir finansal danışman işi olduğunu tek
  cümlede söyle ve elindeki plana dön. Birikim alışkanlığının kendisinden
  (ne kadar, ne zaman, hangi hedefe) bahsetmek serbesttir — ürün önermek değil.
- Borç varken hedeflere para kaydırmayı önerme; uygulamanın sırası budur.
  Tek istisna: acil durum fonu yoksa bunu bir kez hatırlatabilirsin.
- Üslubun Türkçe, kısa, sakin ve yargısız. Suçlama yok, "keşke" yok,
  motivasyon sloganı yok. Rakamlar zaten yeterince şey söylüyor.
- Faiz farkı küçükse bunu dürüstçe söyle: "ikisi arasında kayda değer fark yok,
  hangisine devam etmek seni motive ediyorsa o" demek doğru bir cevaptır.
- Uzun vadeli tarihleri (2-5 yıl sonrası) kesinlik gibi sunma; "bu tempo
  korunursa" diye çerçevele.`;

const SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description:
        "1-2 cümle: borcun ne zaman bittiği ve ardından ilk hedefin ne zaman tamamlandığı. " +
        "Verilen tarihleri kullan.",
    },
    horizon: {
      type: "string",
      description:
        "Uzun vadeli tabloyu 1-2 cümlede özetle: borçsuz tarih, hedeflerin sırası ve tamamlanma " +
        "tarihleri. 'Bu tempo korunursa' diye çerçevele. Hedef yoksa boş bırak.",
    },
    plan: {
      type: "array",
      description: "Bu ay her borca ayrılacak tutar. Verilen dağıtımı aktar, değiştirme.",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          amount: { type: "number" },
          why: { type: "string", description: "En fazla 10 kelimelik gerekçe." },
        },
        required: ["name", "amount", "why"],
      },
    },
    tradeoff: {
      type: "string",
      description: "Çığ ve kartopu arasındaki farkın 1-2 cümlelik dürüst özeti.",
    },
    caution: {
      type: "string",
      description: "Verideki dikkat çeken tek şey. Yoksa boş bırak.",
    },
  },
  required: ["headline", "plan", "tradeoff"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST bekleniyor" }, 405);

  if (!activeProvider()) {
    return json({
      error: "NO_PROVIDER",
      message:
        "Hiçbir model anahtarı tanımlı değil. Supabase → Edge Functions → Secrets " +
        "kısmına GEMINI_API_KEY (ücretsiz) ekleyebilirsin.",
    }, 501);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Geçersiz JSON" }, 400);
  }

  try {
    const out = await callModel(
      SYSTEM,
      "Aşağıdaki veri Defter'in kendi simülasyonundan geliyor. " +
        "Bu ayın planını ve senaryo karşılaştırmasını yaz.\n\n" +
        JSON.stringify(payload, null, 2),
      SCHEMA,
      "odeme_plani",
    );
    return json(out);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 502);
  }
});
