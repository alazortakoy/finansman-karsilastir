# Hesaplama Matematiği — Tam Dokümantasyon

Bu dosya, hesaplama motorundaki **tüm formülleri**, **adım adım hesaplama akışlarını** ve **varsayımları** içerir.

---

## 1. Ortak Tanımlar ve Yardımcı Fonksiyonlar

### 1.1 Parametreler

| Sembol | Açıklama | Birim |
|--------|----------|-------|
| `F` | Konut/araç piyasa değeri | TL |
| `P` | Peşinat (0 olabilir) | TL |
| `R` | Aylık iskonto oranı (paranın zaman değeri) | ondalık |
| `r_ev` | Aylık konut/araç değer artış oranı | ondalık |
| `K_0` | Bugünkü aylık kira tutarı | TL |
| `r_kira` | Aylık kira artış oranı | ondalık |
| `assetType` | `'konut'` veya `'arac'` | — |

### 1.2 Yıllık → Aylık Oran Dönüşümü

Tüm yıllık bileşik oranlar aynı formülle aylığa çevrilir:

```
r_aylık = (1 + r_yıllık)^(1/12) - 1
```

Örnek: Yıllık %30 → `(1.30)^(1/12) - 1 ≈ 0.02210` → aylık %2.21

### 1.3 Bugünkü Değere İndirgeme (İskonto)

Gelecekteki bir nakit akışını bugünkü değerine indirger:

```
PV(nakit, R, t) = nakit / (1 + R)^t
```

- `R = 0` ise indirgeme yapılmaz: `PV = nakit`
- `t = 0` ise indirgeme yapılmaz: `PV = nakit`

### 1.4 Varlık Değeri (Gelecekteki)

Konut/aracın t ayındaki tahmini değeri:

```
F_t = F × (1 + r_ev)^t
```

- `r_ev = 0` veya tanımsız ise: `F_t = F` (sabit kalır)

### 1.5 Kira Tutarı (t. ay)

```
K_t = K_0 × (1 + r_kira)^t
```

- `K_0 = 0` ise kira hesaba katılmaz

### 1.6 Annüite (Sabit Aylık Kredi Taksiti)

```
A = C × [r × (1+r)^n] / [(1+r)^n - 1]
```

- `C` = Kredi tutarı (anapara)
- `r` = Aylık faiz oranı
- `n` = Vade (ay)
- `C = 0` ise `A = 0`
- `r = 0` ise `A = C / n`

### 1.7 Yuvarlama

Tüm parasal sonuçlar 2 ondalığa yuvarlanır:

```
yuvarla(x) = Math.round(x × 100) / 100
```

---

## 2. Banka Kredisi Modeli

### 2.1 Girdiler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `r_b` | Aylık kredi faiz oranı | — (yıllık %2.54'ten hesaplanır) |
| `n_b` | Kredi vadesi (ay) | 120 |
| `dosyaMasrafi` | Tek seferlik dosya masrafı | 0 TL |
| `ekspertizUcreti` | Tek seferlik ekspertiz ücreti | 0 TL |
| `ipotekHarciOrani` | İpotek tesis harcı oranı (kredi tutarı üzerinden) | 0.00455 (binde 4.55) |
| `bsmvOrani` | BSMV oranı (faiz payı üzerinden) | konut: 0, araç: 0.15 |
| `kkdfOrani` | KKDF oranı (faiz payı üzerinden) | konut: 0, araç: 0.15 |
| `daskYillik` | Yıllık DASK primi | 0 TL |
| `konutSigortaYillik` | Yıllık konut sigortası primi | 0 TL |
| `hayatSigortaYillik` | Yıllık hayat sigortası primi | 0 TL |

### 2.2 Hesaplama Akışı

**Adım 1: Kredi tutarı**
```
C = F - P
```

**Adım 2: Sabit aylık taksit (annüite)**
```
A_b = C × [r_b × (1+r_b)^n_b] / [(1+r_b)^n_b - 1]
```

**Adım 3: Tek seferlik maliyetler (T=0)**
```
ipotekHarci = C × ipotekHarciOrani
tekSeferlik = dosyaMasrafi + ekspertizUcreti + ipotekHarci
```

**Adım 4: Yıllık sigorta toplamı**
```
yillikEkMaliyet = daskYillik + konutSigortaYillik + hayatSigortaYillik
```

**Adım 5: T=0 nakit çıkışı**
```
nakitCikisT0 = P + tekSeferlik
maliyetNBD = P + tekSeferlik       (T=0 zaten bugünkü değer, indirgeme yok)
toplamOdeme = P + tekSeferlik
```

**Adım 6: Amortisman tablosu (her ay t = 1, 2, ..., n_b)**

Her ay sırayla:
```
faizPayi_t     = kalanAnapara × r_b
anaparaPayi_t  = A_b - faizPayi_t
bsmv_t         = faizPayi_t × bsmvOrani
kkdf_t         = faizPayi_t × kkdfOrani
efektifTaksit_t = A_b + bsmv_t + kkdf_t

kalanAnapara   = kalanAnapara - anaparaPayi_t   (başlangıç: kalanAnapara = C)
```

Sigorta: Yalnızca `t % 12 === 0` olan aylarda (12., 24., 36. ay...):
```
sigortaEkMaliyet_t = yillikEkMaliyet       (eğer t, 12'nin katıysa)
sigortaEkMaliyet_t = 0                     (diğer aylar)
```

Aylık toplam çıkış:
```
toplamCikis_t = efektifTaksit_t + sigortaEkMaliyet_t
```

**Adım 7: NBD biriktirme**
```
indirgenmisDeger_t = toplamCikis_t / (1 + R)^t
maliyetNBD += indirgenmisDeger_t        (her ay eklenir)
toplamOdeme += toplamCikis_t
```

### 2.3 Çıktılar

```
maliyetNBD  = P + tekSeferlik + Σ(t=1..n_b) [toplamCikis_t / (1+R)^t]
toplamOdeme = P + tekSeferlik + Σ(t=1..n_b) toplamCikis_t
toplamFaiz  = Σ(t=1..n_b) faizPayi_t
```

### 2.4 Önemli Notlar

- Banka modelinde **kira maliyeti YOK** — varlık T=0'da alınır.
- BSMV ve KKDF her ayın **faiz payı** üzerinden hesaplanır, anapara payı üzerinden DEĞİL.
- Faiz payı her ay azalır (amortisman tablosu), dolayısıyla BSMV ve KKDF de her ay azalır.
- İpotek harcı **kredi tutarı (C)** üzerinden tek seferlik hesaplanır, varlık değeri (F) üzerinden değil.

---

## 3. Evim Sistemi Modeli (Çekilişsiz)

### 3.1 Girdiler

| Parametre | Açıklama | Varsayılan |
|-----------|----------|------------|
| `O_oran` | Organizasyon ücreti oranı | 0.08 (%8) |
| `n_e` | Toplam vade (ay) | 120 |
| `t_teslim` | Teslimat ayı | Otomatik hesaplanır |
| `taksitPlani` | Taksit planı tipi ve parametreleri | sabit |
| `kiraDestegi` | Aylık kira desteği tutarı | 0 TL |
| `orgUcretPesinOrani` | Org ücretinin peşin ödenen kısmı | 0.50 (%50) |
| `orgUcretTaksitSayisi` | Kalan org ücretinin taksit sayısı | 4 |

### 3.2 Taksit Planları

**Sabit plan:**
```
taksit_t = (F - P) / n_e                (her ay aynı)
```

**Yıllık artışlı plan:**
```
yil = floor((t - 1) / 12)
taksit_t = baslangicTutar × (1 + yillikArtisOrani)^yil
```

**Teslimat sonrası artışlı plan:**
```
t < t_teslim ise:
    taksit_t = teslimOncesiTutar

t >= t_teslim ise:
    yilSonrasi = floor((t - t_teslim) / 12)
    taksit_t = teslimSonrasiTutar × (1 + yillikArtisOrani)^yilSonrasi
```

### 3.3 Teslimat Ayı Otomatik Hesaplama (Çekilişsiz)

İki koşulun aynı anda sağlandığı ilk ay:

```
Koşul 1: kumulatifTasarruf >= F × 0.40
Koşul 2: t >= max(5, ceil(n_e × 0.40 × (1 - P/F)))
```

Burada:
```
kumulatifTasarruf = P + Σ(i=1..t) taksit_i
```

İki koşul hiç sağlanamazsa fallback:
```
t_teslim = ceil(n_e / 2)
```

### 3.4 Hesaplama Akışı

**Adım 1: Organizasyon ücreti**
```
finansmanTutari = F - P
O_toplam = finansmanTutari × O_oran
O_pesin  = O_toplam × orgUcretPesinOrani
O_taksit = (O_toplam - O_pesin) / orgUcretTaksitSayisi
```

**Adım 2: T=0 nakit çıkışı**
```
nakitCikisT0 = P + O_pesin
maliyetNBD = nakitCikisT0
toplamOdeme = nakitCikisT0
```

**Adım 3: Bekleme dönemi (t = 1, 2, ..., t_teslim - 1)**

Her ay:
```
taksit_t      = taksitPlani'na göre hesaplanan tutar
brutKira_t    = K_0 × (1 + r_kira)^t
kira_t        = max(0, brutKira_t - kiraDestegi)
orgTaksitAy_t = O_taksit     (eğer t <= orgUcretTaksitSayisi, yoksa 0)
sigortaEkMaliyet_t = 0

toplamCikis_t = taksit_t + kira_t + orgTaksitAy_t
```

**Adım 4: Teslimat sonrası dönem (t = t_teslim, ..., n_e)**

Her ay:
```
taksit_t = taksitPlani'na göre hesaplanan tutar
kira_t   = 0                 (artık ev sahipsiniz, kira yok)
orgTaksitAy_t = 0

sigortaEkMaliyet_t = yillikEkMaliyet    (eğer (t - t_teslim) > 0 VE (t - t_teslim) % 12 === 0)
sigortaEkMaliyet_t = 0                  (diğer aylar)

toplamCikis_t = taksit_t + sigortaEkMaliyet_t
```

**Adım 5: Her ay için NBD biriktirme**
```
indirgenmisDeger_t = toplamCikis_t / (1 + R)^t
maliyetNBD += indirgenmisDeger_t
toplamOdeme += toplamCikis_t
```

**Adım 6: Bekleme maliyeti düzeltmesi**

Evim modelinde varlık T=0'da değil, t_teslim'de teslim alınır. Bu gecikmenin maliyetini hesaba katmak için:

```
F_teslim = F × (1 + r_ev)^t_teslim
beklemeFarki = F_teslim / (1 + R)^t_teslim - F
maliyetNBD += beklemeFarki
```

**Yorum:** Bu formül, "t_teslim ayında F_teslim değerinde bir varlık edinmek" ile "T=0'da F değerinde bir varlık edinmek" arasındaki farkı NBD olarak hesaplar.

- `r_ev > 0` ve `R = 0` ise: `beklemeFarki = F_teslim - F > 0` → Bekleme maliyetlidir (varlık değerlendi ama para değerlenmedi)
- `r_ev = 0` ve `R > 0` ise: `beklemeFarki = F/(1+R)^t - F < 0` → Bekleme avantajlıdır (aynı varlığı gecikmiş alım daha ucuz)
- `r_ev ≈ R` ise: `beklemeFarki ≈ 0`

### 3.5 Çıktılar

```
maliyetNBD  = nakitCikisT0 + Σ(t=1..n_e) [toplamCikis_t / (1+R)^t] + beklemeFarki
toplamOdeme = nakitCikisT0 + Σ(t=1..n_e) toplamCikis_t
toplamOrgUcreti = O_toplam
toplamKira = Σ(t=1..t_teslim-1) kira_t
```

---

## 4. Evim Sistemi — Çekilişli Model

Çekilişli modelde teslimat ayı belirsizdir. Üç senaryo hesaplanır:

```
enIyi:    t_teslim = 1                           (ilk ayda çekilişi kazanır)
beklenen: t_teslim = round(grupBuyuklugu / 2)    (ortalama bekleme)
enKotu:   t_teslim = grupBuyuklugu               (en son çekilişi kazanır)
```

Her senaryo için Bölüm 3'teki tam Evim NBD hesabı ayrı ayrı çalıştırılır, sadece `t_teslim` değişir.

---

## 5. Kendin Biriktir Modeli

Üç alt modu vardır:

### 5.1 Mod A: "Kaç Ayda Alırım?" (`ayHesapla`)

**Girdiler:**
- `aylikBirikim`: Başlangıç aylık birikim tutarı (TL)
- `aylikBirikimArtisOrani`: Aylık birikim artış oranı (yıllıktan aylığa çevrilmiş)
- `r_mevduat`: Aylık net yatırım getirisi (stopaj sonrası)
- `P`: Başlangıçta yatırıma yönlendirilen peşinat

**Hesaplama:**

Başlangıç:
```
S_0 = P × (1 + r_mevduat)        (P ilk ay yatırıma girer)
```

Her ay (t = 1, 2, ..., 600):
```
aylikTutar_t = aylikBirikim × (1 + artisOrani)^(t-1)
S_t = S_(t-1) × (1 + r_mevduat) + aylikTutar_t
F_t = F × (1 + r_ev)^t
```

Durma koşulu:
```
S_t >= F_t   →   hesaplananAy = t, döngüden çık
```

Eğer 600 aya kadar sağlanmazsa: `hesaplananAy = 600`

**NBD hesabı:**
```
maliyetNBD = P + Σ(t=1..hesaplananAy) [(aylikTutar_t + kira_t) / (1+R)^t]
```

### 5.2 Mod B: "Aylık Ne Biriktirmeliyim?" (`tutarHesapla`)

**Girdiler:**
- `hedefAy`: Kaç ayda almak istediği
- `aylikBirikimArtisOrani`: Aylık birikim artış oranı
- `r_mevduat`: Aylık net yatırım getirisi

**Hesaplama:**

Hedef varlık değeri:
```
F_hedef = F × (1 + r_ev)^hedefAy
```

Peşinatın hedef aydaki gelecek değeri:
```
FV_P = P × (1 + r_mevduat)^hedefAy
```

Aylık birikimlerin gelecek değeri (base tutar ile):
```
FV_birikim(base) = Σ(t=1..hedefAy) [base × (1 + artisOrani)^(t-1) × (1 + r_mevduat)^(hedefAy - t)]
```

Hedef:
```
FV_P + FV_birikim(base) >= F_hedef
```

Çözüm: Binary search ile `base` tutarı bulunur:
```
lo = 0, hi = F_hedef
100 iterasyon:
    mid = (lo + hi) / 2
    FV_birikim(mid) + FV_P >= F_hedef - 1 TL ise: hi = mid
    değilse: lo = mid
    |hi - lo| < 0.01 ise dur

gerekliAylikTutar = ceil(hi × 100) / 100     (güvenli yuvarlama)
```

**NBD hesabı:**
```
maliyetNBD = P + Σ(t=1..hedefAy) [(gerekliTutar × (1+artis)^(t-1) + kira_t) / (1+R)^t]
```

### 5.3 Mod C: "Piyango Karşılaştırması" (`piyangoKarsilastir`)

Bu mod Evim taksitlerinin aynısını yatırıma yönlendirir ve hedef ayda yeterli olup olmadığını kontrol eder.

**Girdiler:**
- Evim sistemi parametreleri (taksit planı, org ücreti, vade)
- `hedefAy`: Hedef alım ayı
- `r_mevduat`: Aylık net yatırım getirisi

**Hesaplama:**

T=0 yatırım:
```
O_toplam = (F - P) × O_oran
O_pesin  = O_toplam × orgUcretPesinOrani
lumpSum  = P + O_pesin
```

Birikim gelecek değeri:
```
S_mevduat = lumpSum × (1 + r_mevduat)^hedefAy
          + Σ(t=1..hedefAy-1) [taksit_t × (1 + r_mevduat)^(hedefAy - t)]
```

Burada `taksit_t`, Evim taksit planına göre hesaplanan tutardır.

Yeterlilik:
```
F_hedef = F × (1 + r_ev)^hedefAy
fark = S_mevduat - F_hedef
yeterliMi = fark >= 0
```

**NBD hesabı:**
```
maliyetNBD = lumpSum + Σ(t=1..hedefAy) [(taksit_t + kira_t) / (1+R)^t]

eksik = max(0, F_hedef - S_mevduat)
fazla = max(0, S_mevduat - F_hedef)

maliyetNBD += eksik / (1+R)^hedefAy     (eksik kalan tutarın NBD'si eklenir)
maliyetNBD -= fazla / (1+R)^hedefAy     (fazla tutarın NBD'si çıkarılır)
```

**Not (piyangoKarsilastir):** Bu modda `taksit_t`'nin son ayı (t = hedefAy) hesaplamaya dahil edilmez — birikim FV'ye yalnızca `t = 1..hedefAy-1` arası eklenir. Ancak nakit akışı tablosunda son ayın taksiti 0 olarak gösterilir.

---

## 6. Karşılaştırma

Üç model aynı metrikle karşılaştırılır:

```
En karlı model = argmin(maliyetNBD_banka, maliyetNBD_evim, maliyetNBD_biriktir)
```

En düşük `maliyetNBD` = en az maliyet = en karlı seçenek.

---

## 7. Varsayımlar ve Limitler

### 7.1 Genel Varsayımlar
- Tüm oranlar sabit kalır (değişken faiz modeli YOK)
- Enflasyon ve değer artışı bileşik olarak uygulanır
- Tüm nakit akışları ay sonunda gerçekleşir (end-of-period)
- Peşinat T=0'da ödenir
- Banka modelinde varlık T=0'da edinilir (kira yok)
- Evim/Biriktir modellerinde varlık teslimat/hedef ayında edinilir (o zamana kadar kira var)

### 7.2 Mevzuat Varsayımları
- BSMV: Konut kredisi istisnası (%0), tüketici/araç kredisi %15
- KKDF: Konut kredisi %0, tüketici/araç kredisi %15
- İpotek tesis harcı: Kredi tutarının binde 4,55'i (sabit oran)
- Evim org ücreti: Finanse edilen tutar (F-P) üzerinden (F üzerinden DEĞİL)
- Org ücreti minimum %50 peşin (BDDK kuralı), kalan max 4 taksit

### 7.3 Sınırlar
- Konut/araç değeri: 100.000 — 100.000.000 TL
- Peşinat: 0 ≤ P < F
- Banka faizi: %0.01 — %500 yıllık
- Kredi vadesi: 12 — 360 ay
- Evim vadesi: konut 12-240 ay, araç 12-120 ay
- Org ücreti oranı: %0 — %20
- İskonto oranı: %0 — %500 yıllık
- Biriktir ay hesaplama: max 600 ay (50 yıl)
- Binary search: max 100 iterasyon, hassasiyet 0.01 TL

---

## 8. Sayısal Örnek

**Girdiler:**
- F = 5.000.000 TL, P = 0 TL
- Yıllık iskonto: %30 → aylık R = (1.30)^(1/12) - 1 ≈ 0.02210
- Yıllık konut artışı: %30 → aylık r_ev ≈ 0.02210
- Kira: 0 TL

**Banka:**
- Yıllık faiz: %2.54 → aylık r_b = (1.0254)^(1/12) - 1 ≈ 0.002094
- Vade: 120 ay
- Ek maliyetler: tümü 0

```
C = 5.000.000
A_b = 5.000.000 × [0.002094 × (1.002094)^120] / [(1.002094)^120 - 1]
    ≈ 46.723 TL

T=0: maliyetNBD = 0 (P=0, tekSeferlik=0)
T=1: faizPayi = 5.000.000 × 0.002094 = 10.470
     efektifTaksit = 46.723 + 0 + 0 = 46.723 (konut: BSMV=KKDF=0)
     indirgenmisDeger = 46.723 / 1.02210 = 45.713
T=2: kalanAnapara ≈ 4.963.747
     faizPayi = 4.963.747 × 0.002094 ≈ 10.394
     ...

toplamOdeme = Σ 46.723 × 120 = 5.606.794
```

**Evim (sabit plan, çekilişsiz):**
```
taksit = (5.000.000 - 0) / 120 = 41.667 TL/ay
O_toplam = 5.000.000 × 0.08 = 400.000
O_pesin = 400.000 × 0.50 = 200.000
O_taksit = 200.000 / 4 = 50.000 TL (ilk 4 ay)

T=0: maliyetNBD = 0 + 200.000 = 200.000
T=1..t_teslim-1: taksit + kira + orgTaksit ayları
T=t_teslim..120: sadece taksit

+ beklemeFarki düzeltmesi
```
