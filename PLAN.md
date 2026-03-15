# Calculator UI Overhaul Plan

## Context
Mevcut calculator tek sayfalık form yapısında. Kullanıcı deneyimini iyileştirmek için 6 adımlı wizard'a dönüştürülecek, eksik maliyet kalemleri eklenecek, gereksiz inputlar kaldırılacak, ve quarterly stacked bar chart ile görselleştirme eklenecek. Engine'de de buna paralel güncellemeler gerekiyor.

---

## Faz 1: Engine Güncellemeleri ✅ TAMAMLANDI
> Commit: 5632d4b — 144/144 test geçti

### 1.1 types.ts Güncellemeleri
- `BankaEkMaliyetler`'e `kkdfOrani` alanı ekle (number, default konut=0, araç=0.15)
- `TaksitPlan` union type'dan `manuel` seçeneğini kaldır
- `ManuelPlan` interface'i sil
- `BirikimParams`'a yeni alanlar:
  - `aylikBirikimArtisOrani` (enflasyona bağlı aylık artış)
  - `hesaplamaModu`: `'ayHesapla'` | `'tutarHesapla'` (kaç ayda alır vs. aylık ne biriktirmeli)
- `BirikimDetay`'a `gerekliAylikTutar?: number` ekle

### 1.2 banka.ts — KKDF Eklenmesi
- Her ay faiz payı üzerinden KKDF hesapla: `kkdf = faizPayi * kkdfOrani`
- `efektifTaksit = A_b + bsmv + kkdf`
- Konut için default 0%, araç için default %15 (kullanıcı değiştirebilir)
- **BEKLEYEN:** Kullanıcıdan KKDF detayları ve dinamik maliyet eşikleri gelecek

### 1.3 biriktir.ts — Yeni Hesaplama Modları
- **Mevcut:** Evim taksitleriyle aynı tutarı yatır, hedef ayda yeterli mi kontrol et
- **Yeni Mod 1 (ayHesapla):** Aylık birikim tutarı verildiğinde kaç ayda eve ulaşır
  - Aylık tutar enflasyonla artar: `tutar_t = tutar_0 * (1 + r_enflasyon)^t`
  - Her ay bileşik getiri ile büyür
  - `S_t >= F_t` olan ilk ay = hedef ay
- **Yeni Mod 2 (tutarHesapla):** Hedef ay verildiğinde aylık ne biriktirmeli
  - Binary search veya analitik çözüm ile başlangıç tutarını bul
  - Yine enflasyonla artan aylık tutar varsayımı

### 1.4 helpers.ts — Sabit Taksit Otomatik Hesaplama
- `hesaplaSabitTaksit(F, P, n_e)`: `(F - P) / n_e` — basit bölme
- Evim sisteminde sabit planda kullanıcıdan tutar sormak yerine otomatik hesapla

### 1.5 Testler Güncelle
- `banka.test.ts`: KKDF'li hesaplama testleri ekle
- `biriktir.test.ts`: Yeni modlar için testler
- `helpers.test.ts`: `hesaplaSabitTaksit` testi
- Manuel plan testlerini kaldır
- `integration.test.ts`: Güncellenmiş parametrelerle entegrasyon testleri

**Dosyalar:** `types.ts`, `banka.ts`, `biriktir.ts`, `helpers.ts`, `__tests__/*`

---

## Faz 2: Wizard Altyapısı & Temel Adımlar (Step 1-2)
> Tek conversation'da tamamlanabilir

### 2.1 WizardNav.astro Bileşeni (YENİ)
- Progress bar: 6 adım, aktif adım teal vurgulu
- Adım isimleri: Temel Bilgiler → Gelişmiş Ayarlar → Banka → Evim → Biriktir → Sonuçlar
- İleri / Geri butonları (mobilde tam genişlik)
- Adım geçişinde validation kontrolü
- Mobilde adım isimleri kısaltılmış veya sadece numara

### 2.2 index.astro Yeniden Yapılandırma
- Mevcut tek-form yapısını 6 `<div class="wizard-step">` paneline böl
- Her panel varsayılan `hidden`, sadece aktif olan görünür
- Client-side wizard state yönetimi: `currentStep`, `goNext()`, `goBack()`
- Validation her adımda: geçersizse ileri gitmeyi engelle

### 2.3 Step 1: Temel Bilgiler (CommonInputs yeniden tasarım)
- Varlık tipi: Konut / Araç (büyük toggle butonları, açıklama metni ile)
- Varlık değeri (F): TL input, açıklama: "Almayı düşündüğünüz konutun/aracın güncel piyasa değeri"
- Peşinat (P): TL input, açıklama: "Elinizde bulunan ve peşin ödeyebileceğiniz tutar"
- Default değerler gösterilsin (F: 5.000.000, P: 0)

### 2.4 Step 2: Gelişmiş Ayarlar (Basitleştirilmiş)
- **İskonto Oranı:** TEK input — "Yıllık Bileşik Faiz Oranı (%)"
  - Açıklama: "Paranızı bankada değerlendirseniz yıllık ne kazanırdınız? Bu oran tüm modellerde paranın zaman değerini hesaplamak için kullanılır."
  - Default: %30
  - Eski 3 tab (Enflasyon/Mevduat/Özel) kaldırılıyor
- **Konut Değer Artışı:** Yıllık % input
  - Açıklama: "Konut/araç değerinin yıllık ne kadar artacağını tahmin ediyorsunuz?"
  - Default: %30
- **Kira Bilgileri:**
  - Aylık kira: TL input, açıklama: "Şu an ödediğiniz veya ödeyeceğiniz aylık kira tutarı"
  - Kira artış oranı: Yıllık %, default: %30
  - Açıklama: "Eve sahip olana kadar kira ödemeye devam edeceksiniz. Bu tutar karşılaştırmada dikkate alınır."

**Dosyalar:** `WizardNav.astro` (yeni), `CommonInputs.astro`, `index.astro`

---

## Faz 3: Model Adımları (Step 3-4-5)
> Tek conversation'da tamamlanabilir

### 3.1 Step 3: Banka Kredisi (BankaInputs yeniden tasarım)
- **Yıllık Faiz Oranı:** Default %2.54, açıklama ile
- **Vade (ay):** Default 120, açıklama: "Kredi kaç ay sürecek?"
- **Ek Maliyetler — HER ZAMAN AÇIK** (toggle kaldırılıyor):
  - Dosya masrafı (TL) — açıklama ile
  - Ekspertiz ücreti (TL) — açıklama ile
  - İpotek tesis harcı (TL) — açıklama ile
  - BSMV oranı (%) — default %5, açıklama: "Kredi faizi üzerinden alınan vergi"
  - **KKDF oranı (%) — YENİ** — konut için default %0, araç için %15
    - Açıklama: "Kaynak Kullanımını Destekleme Fonu. Konut kredilerinde %0, tüketici/araç kredilerinde %15."
    - Varlık tipine göre otomatik default değişsin
  - Sigorta primleri (DASK, konut, hayat) — yıllık TL

### 3.2 Step 4: Evim Sistemi (EvimInputs yeniden tasarım)
- **Model seçimi:** Çekilişsiz / Çekilişli toggle
- **Organizasyon ücreti oranı (%):** Default %8, açıklama ile
- **Toplam Vade:** Default = Banka vade değeri (step 3'ten), değiştirilebilir
  - Açıklama: "Karşılaştırma için banka kredisi vadesiyle aynı tutmanız önerilir."
- **Taksit Planı** (3 seçenek, Manuel KALDIRILDI):
  - **Sabit:** Otomatik hesaplanır → `(F-P)/n_e` gösterilir, input yok
  - **Yıllık Artışlı:** Başlangıç taksit + artış oranı input
  - **Teslimat Sonrası Artışlı:** Teslim öncesi/sonrası tutarlar + artış oranı
- **Teslimat Ayı:**
  - Çekilişsiz: Otomatik hesaplanır, sadece bilgi metni olarak gösterilir (input DEĞİL)
  - Çekilişli: Grup büyüklüğü input → 3 senaryo otomatik
- **Kira Desteği:**
  - Toggle ile açılır
  - Açıklama: "Evim sistemi şirketleri (Eminevim vb.) teslimat öncesi dönemde kira giderinizin bir kısmını karşılayabilir. Bu tutar sözleşmenize göre değişir. Sözleşmenizde belirtilen aylık kira desteği tutarını girin."
  - TL input
- **Org Ücreti Ödeme:** Peşin oran + taksit sayısı (mevcut gibi)

### 3.3 Step 5: Kendin Biriktir (BirikimInputs yeniden tasarım)
- **Otomatik değerler:** Yatırım getirisi = Step 2'deki iskonto oranı (ayrı input yok)
- **Stopaj oranı:** Default %15
- **İki mod göster:**
  - **Mod A:** "Evim taksiti kadar biriktirsen kaç ayda alırsın?"
    - Otomatik: Evim step'indeki taksit tutarını baz alır
    - Aylık tutar enflasyonla (%30 default) artar
    - Sonuç: X ay
  - **Mod B:** "Y ayda almak için aylık ne biriktirmelisin?"
    - Y = Evim teslimat ayı (default) veya kullanıcı değiştirebilir
    - Sonuç: Aylık Z TL (enflasyonla artarak)
- Açıklama: "Hiçbir finansman sistemine girmeden, paranızı kendiniz biriktirip yatırarak konutu almayı hedeflediğiniz senaryo."

**Dosyalar:** `BankaInputs.astro`, `EvimInputs.astro`, `BirikimInputs.astro`, `index.astro` (client script)

---

## Faz 4: Sonuçlar & Grafik (Step 6)
> Tek conversation'da tamamlanabilir

### 4.1 Chart.js Entegrasyonu
- `npm install chart.js` (package.json'a ekle)
- Yeni bileşen: `QuarterlyChart.astro`

### 4.2 Quarterly Stacked Bar Chart
- X ekseni: Çeyrekler (Q1 2026, Q2 2026, ...)
- Y ekseni: TL tutarı
- Her bar'da stacked renkler:
  - **Taksit/Anapara:** Teal (#0D9488)
  - **Kira:** Amber (#F59E0B)
  - **Sigorta/Ek Maliyet:** Slate (#64748B)
  - **Organizasyon Ücreti:** Purple (#8B5CF6) (sadece Evim)
  - **BSMV+KKDF:** Rose (#F43F5E) (sadece Banka)
- Model seçici tab'lar ile modeller arası geçiş (Banka / Evim / Biriktir)
- Çekilişli'de senaryo tab'ları da çalışsın
- **Teslimat noktası:** Dikey çizgi + annotation "Eve Sahip Olma" noktası
- Mobilde yatay scroll veya responsive küçülme
- Tooltip: Hover/touch'ta detaylı breakdown

### 4.3 ResultsSummary Güncellemesi
- Mevcut karşılaştırma kartları korunsun (zaten beğenilmiş)
- Kartların altına grafik eklensin
- Nakit akışı tablosu korunsun (toggle ile)

### 4.4 NakitAkisi → Quarterly Aggregation
- Engine'den gelen aylık `aylikNakitAkisi[]` verisini 3'er aylık gruplara topla
- Her quarter için: sum(taksit), sum(kira), sum(sigortaEkMaliyet), sum(orgUcretTaksit)
- Bu aggregation client-side JS'de yapılır (engine'e gerek yok)

**Dosyalar:** `package.json`, `QuarterlyChart.astro` (yeni), `ResultsSummary.astro`, `CashFlowTable.astro`, `index.astro`

---

## Faz 5: Polish & Default Değerler
> Son conversation'da tamamlanabilir

### 5.1 Default Değerler Sistemi
- Tüm default değerleri tek bir `src/lib/defaults.ts` dosyasında topla
- Aylık güncelleme kolay olsun (TCMB, ekonomist verileri)
- Defaults:
  - İskonto oranı: %30
  - Konut değer artışı: %30
  - Kira artış oranı: %30
  - Banka faizi: %2.54
  - BSMV: %5
  - KKDF konut: %0, araç: %15 (kullanıcı bilgisi beklenecek)
  - Evim org ücreti: %8
  - Stopaj: %15

### 5.2 Açıklama Metinleri
- Her input'un yanında `?` ikonu → tıklayınca/hover'da tooltip açıklama
- Wizard adımlarının üstünde 1-2 cümle genel açıklama
- Disclaimer metinleri CLAUDE.md'deki gibi yerleştirilsin

### 5.3 Mobil Test & İyileştirme
- 320px'de tüm wizard adımları test
- Touch target'lar min 44x44px
- Input'larda 16px font (iOS zoom engeli)
- Progress bar mobilde compact görünüm

### 5.4 Vade Senkronizasyonu
- Banka vadesi değiştiğinde Evim vadesi otomatik güncelle (kullanıcı override edebilir)
- Biriktir hedef ayı = Evim teslimat ayı (default, değiştirilebilir)

---

## Bekleyen Bilgiler (Kullanıcıdan)
- [ ] KKDF detayları: konut/araç oranları, hesaplama şekli
- [ ] Dinamik maliyet eşikleri (ipotek harcı vb. değer bazlı farklı oranlar)

---

## Doğrulama (Verification)
1. `npm run test` — Tüm engine testleri geçmeli
2. `npm run build` — Astro build başarılı olmalı
3. Manuel test: Wizard 6 adım boyunca mobilde (320px) akış testi
4. Grafik: 3 model için quarterly chart doğru render etmeli
5. Karşılaştırma: En düşük MaliyetNBD doğru model yeşil badge almalı
6. Edge case: R=0, r_ev=0, kira=0 durumları disclaimer göstermeli
