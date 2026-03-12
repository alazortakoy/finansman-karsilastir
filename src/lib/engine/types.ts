// ============================================================
// Konut Finansman Karşılaştırma Aracı — Type Definitions
// All interfaces match SPEC.md sections 2–4
// ============================================================

// --- 2.1 Common (Shared) Parameters ---

export type AssetType = 'konut' | 'arac';

export type RMode = 'enflasyon' | 'mevduat' | 'custom';

export interface CommonParams {
  F: number;           // Asset value (TL)
  P: number;           // Down payment (TL) — can be 0
  assetType: AssetType;

  // Optional parameters (user toggles on/off)
  R?: number;          // Monthly discount rate (decimal, e.g. 0.025 = 2.5%)
  R_mode?: RMode;
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
  ipotekTesisUcreti?: number;
  bsmvOrani?: number;         // Default: 0.05 (5% on interest)
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
    }
  | { tip: 'manuel'; aylikTutarlar: number[] };

export interface EvimParams {
  model: EvimModel;
  O_oran: number;        // Organization fee rate (decimal, e.g. 0.07–0.10)
  n_e: number;           // Total term (months)
  t_teslim: number;      // Delivery month

  taksitPlani: TaksitPlan;

  // Rent support (optional)
  kiraDestegi?: number;
  r_kiraDestegi?: number;

  // Organization fee payment plan
  orgUcretPesinOrani?: number;   // Default: 0.50 (BDDK min.)
  orgUcretTaksitSayisi?: number; // Max 4

  // Post-delivery insurance costs (optional)
  daskYillik?: number;
  konutSigortaYillik?: number;
  hayatSigortaYillik?: number;
}

// --- 2.4 Self-Save Parameters ---

export interface BirikimParams {
  r_mevduat: number;   // Monthly net investment return rate (decimal)
  stopajOrani?: number; // Default: 0.15 (15%)
  hedefAy: number;     // Target month to buy
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
  toplamBirikim: number;    // S_mevduat at target month
  hedefKonutDegeri: number; // F_hedef
  yeterliMi: boolean;
  fark: number;             // S_mevduat - F_hedef
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
