// ============================================================
// Konut Finansman Karşılaştırma Aracı — Type Definitions
// All interfaces match SPEC.md sections 2–4
// ============================================================

// --- 2.1 Common (Shared) Parameters ---

export type AssetType = 'konut' | 'arac';

export interface CommonParams {
  F: number;           // Asset value (TL)
  P: number;           // Down payment (TL) — can be 0
  assetType: AssetType;

  // Optional parameters (user toggles on/off)
  R?: number;          // Monthly discount rate (decimal, e.g. 0.025 = 2.5%)
  r_ev?: number;       // Monthly asset appreciation rate (decimal)
  K_0?: number;        // Current monthly rent (TL) — 0 or undefined = no rent
  r_kira?: number;     // Monthly rent increase rate (decimal)
}

// --- 2.2 Bank Loan Parameters ---

export interface BankaParams {
  r_b: number;          // Monthly loan interest rate (decimal)
  n_b: number;          // Loan term (months)

  // One-time costs (all optional, default 0)
  dosyaMasrafi?: number;
  ekspertizUcreti?: number;
  ipotekHarciOrani?: number;  // Default: 0.00455 (binde 4.55 on loan amount)
  bsmvOrani?: number;         // Default: 0.15 for tüketici/araç, 0 for konut (on interest)
  kkdfOrani?: number;         // Default: 0.15 for tüketici/araç, 0 for konut (on interest)
  daskYillik?: number;
  konutSigortaYillik?: number;
  hayatSigortaYillik?: number;
}

// --- 2.3 Evim System Parameters ---

export type EvimModel = 'cekilissiz' | 'cekilisli';

export type TaksitPlan =
  | { tip: 'sabit'; aylikTutar: number }
  | { tip: 'yillikArtisli'; baslangicTutar: number; yillikArtisOrani: number }
  | {
      tip: 'teslimatSonrasiArtisli';
      teslimOncesiTutar: number;
      teslimSonrasiTutar: number;
      yillikArtisOrani: number;
    };

export interface EvimParams {
  model: EvimModel;
  O_oran: number;        // Organization fee rate on financed amount (decimal, e.g. 0.07–0.10)
  n_e: number;           // Total term (months)
  t_teslim: number;      // Delivery month

  taksitPlani: TaksitPlan;

  // Rent support (optional)
  kiraDestegi?: number;

  // Organization fee payment plan
  orgUcretPesinOrani?: number;   // Default: 0.50 (BDDK min.)
  orgUcretTaksitSayisi?: number; // Max 4

  // Post-delivery insurance costs (optional)
  daskYillik?: number;
  konutSigortaYillik?: number;
  hayatSigortaYillik?: number;
}

// --- 2.4 Self-Save Parameters ---

export type BirikimModu = 'ayHesapla' | 'tutarHesapla' | 'piyangoKarsilastir';

export interface BirikimParams {
  r_mevduat: number;     // Monthly net investment return rate (decimal)
  stopajOrani?: number;  // Default: 0.15 (15%)
  mod: BirikimModu;      // Which calculation mode to use

  // For 'ayHesapla': given monthly amount, find how many months to buy
  aylikBirikim?: number;          // Starting monthly savings amount (TL)
  aylikBirikimArtisOrani?: number; // Monthly increase rate (inflation-linked, decimal)

  // For 'tutarHesapla': given target month, find required monthly amount
  hedefAy?: number;               // Target month to buy

  // For 'piyangoKarsilastir': original mode — uses Evim installments as savings
  // hedefAy is required
}

// --- 3.5 Lottery Draw Scenarios ---

export interface CekilisliSenaryolar {
  enIyi: number;       // t_teslim = 1
  beklenen: number;    // t_teslim = Math.round(grupBuyuklugu / 2)
  enKotu: number;      // t_teslim = grupBuyuklugu
  ozel?: number;       // Custom user-specified month
}

// --- 4.1 Output Structures ---

export interface NakitAkisi {
  ay: number;
  taksit: number;
  kira: number;
  sigortaEkMaliyet: number;
  orgUcretTaksit: number;
  toplamCikis: number;
  kumulatifCikis: number;
  indirgenmisDeger: number;
}

export interface BirikimDetay {
  toplamBirikim: number;       // S_mevduat at target/calculated month
  hedefKonutDegeri: number;    // F_hedef at that month
  yeterliMi: boolean;
  fark: number;                // S_mevduat - F_hedef
  hesaplananAy?: number;       // For 'ayHesapla' mode: month when savings >= asset value
  gerekliAylikTutar?: number;  // For 'tutarHesapla' mode: required starting monthly amount
}

export interface ModelSonuc {
  maliyetNBD: number;
  toplamOdeme: number;
  toplamFaiz?: number;        // Bank model only
  toplamOrgUcreti?: number;   // Evim model only
  toplamKira?: number;
  aylikNakitAkisi: NakitAkisi[];
  birikim?: BirikimDetay;     // Self-save model only
}

export type ModelAdi = 'banka' | 'evim' | 'biriktir';

export interface KarsilastirmaSonuc {
  banka: ModelSonuc;
  evim: ModelSonuc;
  biriktir: ModelSonuc;
  enKarliModel: ModelAdi;
}
