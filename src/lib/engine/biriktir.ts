import type {
  CommonParams,
  EvimParams,
  BirikimParams,
  ModelSonuc,
  NakitAkisi,
  BirikimDetay,
} from './types';
import { getTaksit, getKira, indirge, varlikDegeri, yuvarla } from './helpers';

/**
 * Calculates "save-it-yourself" model — three modes:
 *
 * 1. 'ayHesapla': Given monthly savings amount (+ inflation-linked increase),
 *    find how many months until savings >= asset value.
 *
 * 2. 'tutarHesapla': Given target month, find the required starting monthly
 *    savings amount (with inflation-linked increase).
 *
 * 3. 'piyangoKarsilastir': Original mode — redirects Evim installments to
 *    savings and checks sufficiency at hedefAy.
 */

// Internal result shape that carries raw (non-rounded) totals alongside
// display-rounded cash flow entries, so the public API can use full precision.
interface ModeResult {
  nakitAkislari: NakitAkisi[];
  birikimDetay: BirikimDetay;
  toplamKira: number;
  rawToplamOdeme: number;
  rawMaliyetNBD: number;
  hesaplananAy?: number;
  gerekliAylikTutar?: number;
}

// ── Mode: ayHesapla ─────────────────────────────────────────────────
function hesaplaAyModu(
  common: CommonParams,
  birikim: BirikimParams,
): ModeResult {
  const { F, P } = common;
  const R = common.R ?? 0;
  const K_0 = common.K_0 ?? 0;
  const r_kira = common.r_kira ?? 0;
  const r_ev = common.r_ev;

  const { r_mevduat } = birikim;
  const aylikBirikim = birikim.aylikBirikim ?? 0;
  const artisOrani = birikim.aylikBirikimArtisOrani ?? 0;

  const MAX_AY = 600; // 50 years safety limit

  // P is invested at T=0. At end of month 1 it should have 1 month of growth.
  let S = P;
  let toplamKira = 0;
  let rawToplamOdeme = P;
  let rawMaliyetNBD = P;
  const aylikNakitAkisi: NakitAkisi[] = [];
  let kumulatifCikis = P;
  let hesaplananAy = MAX_AY;

  for (let t = 1; t <= MAX_AY; t++) {
    // Monthly savings with inflation-linked increase
    const aylikTutar = aylikBirikim * Math.pow(1 + artisOrani, t - 1);

    // Compound previous balance and add this month's contribution
    S = S * (1 + r_mevduat) + aylikTutar;

    // Asset value at month t
    const F_t = varlikDegeri(F, r_ev, t);

    // Rent
    let kira = 0;
    if (K_0 > 0) {
      kira = getKira(K_0, r_kira, t);
      toplamKira += kira;
    }

    const toplamCikis = aylikTutar + kira;
    kumulatifCikis += toplamCikis;
    const indirgenmisDeger = indirge(toplamCikis, R, t);

    // Track raw totals at full precision
    rawToplamOdeme += toplamCikis;
    rawMaliyetNBD += indirgenmisDeger;

    aylikNakitAkisi.push({
      ay: t,
      taksit: yuvarla(aylikTutar),
      kira: yuvarla(kira),
      sigortaEkMaliyet: 0,
      orgUcretTaksit: 0,
      toplamCikis: yuvarla(toplamCikis),
      kumulatifCikis: yuvarla(kumulatifCikis),
      indirgenmisDeger: yuvarla(indirgenmisDeger),
    });

    if (S >= F_t) {
      hesaplananAy = t;
      break;
    }
  }

  const F_hedef = varlikDegeri(F, r_ev, hesaplananAy);

  return {
    hesaplananAy,
    birikimDetay: {
      toplamBirikim: yuvarla(S),
      hedefKonutDegeri: yuvarla(F_hedef),
      yeterliMi: S >= F_hedef,
      fark: yuvarla(S - F_hedef),
      hesaplananAy,
    },
    nakitAkislari: aylikNakitAkisi,
    toplamKira,
    rawToplamOdeme,
    rawMaliyetNBD,
  };
}

// ── Mode: tutarHesapla ──────────────────────────────────────────────
function hesaplaTutarModu(
  common: CommonParams,
  birikim: BirikimParams,
): ModeResult {
  const { F, P } = common;
  const r_ev = common.r_ev;
  const { r_mevduat } = birikim;
  const hedefAy = birikim.hedefAy!;
  const artisOrani = birikim.aylikBirikimArtisOrani ?? 0;

  // Target asset value at hedefAy
  const F_hedef = varlikDegeri(F, r_ev, hedefAy);

  // Future value of P invested at T=0
  const fvP = P * Math.pow(1 + r_mevduat, hedefAy);

  // Remaining amount to accumulate from monthly savings
  const remaining = F_hedef - fvP;

  if (remaining <= 0) {
    // P alone is enough — no monthly savings needed
    return buildNakitAkisiForTutar(common, birikim, 0, hedefAy, F_hedef);
  }

  // Find base monthly amount using binary search
  // FV of increasing savings: Σ(t=1..hedefAy) base*(1+artis)^(t-1) * (1+r_mevduat)^(hedefAy-t)
  let lo = 0;
  let hi = F_hedef; // Upper bound: entire asset value
  const EPSILON = 1;

  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const fv = hesaplaBirikimFV(mid, artisOrani, r_mevduat, hedefAy);
    if (fv + fvP >= F_hedef - EPSILON) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi - lo < 0.01) break;
  }

  const gerekliTutar = Math.ceil(hi * 100) / 100; // Round up to be safe
  return buildNakitAkisiForTutar(common, birikim, gerekliTutar, hedefAy, F_hedef);
}

function hesaplaBirikimFV(
  baseTutar: number,
  artisOrani: number,
  r_mevduat: number,
  hedefAy: number,
): number {
  let fv = 0;
  for (let t = 1; t <= hedefAy; t++) {
    const tutar = baseTutar * Math.pow(1 + artisOrani, t - 1);
    fv += tutar * Math.pow(1 + r_mevduat, hedefAy - t);
  }
  return fv;
}

function buildNakitAkisiForTutar(
  common: CommonParams,
  birikim: BirikimParams,
  gerekliTutar: number,
  hedefAy: number,
  F_hedef: number,
): ModeResult {
  const { P } = common;
  const R = common.R ?? 0;
  const K_0 = common.K_0 ?? 0;
  const r_kira = common.r_kira ?? 0;
  const { r_mevduat } = birikim;
  const artisOrani = birikim.aylikBirikimArtisOrani ?? 0;

  let S = P * Math.pow(1 + r_mevduat, hedefAy);
  const fvMonthly = hesaplaBirikimFV(gerekliTutar, artisOrani, r_mevduat, hedefAy);
  S += fvMonthly;

  let toplamKira = 0;
  let rawToplamOdeme = P;
  let rawMaliyetNBD = P;
  let kumulatifCikis = P;
  const aylikNakitAkisi: NakitAkisi[] = [];

  for (let t = 1; t <= hedefAy; t++) {
    const aylikTutar = gerekliTutar * Math.pow(1 + artisOrani, t - 1);

    let kira = 0;
    if (K_0 > 0) {
      kira = getKira(K_0, r_kira, t);
      toplamKira += kira;
    }

    const toplamCikis = aylikTutar + kira;
    kumulatifCikis += toplamCikis;
    const indirgenmisDeger = indirge(toplamCikis, R, t);

    rawToplamOdeme += toplamCikis;
    rawMaliyetNBD += indirgenmisDeger;

    aylikNakitAkisi.push({
      ay: t,
      taksit: yuvarla(aylikTutar),
      kira: yuvarla(kira),
      sigortaEkMaliyet: 0,
      orgUcretTaksit: 0,
      toplamCikis: yuvarla(toplamCikis),
      kumulatifCikis: yuvarla(kumulatifCikis),
      indirgenmisDeger: yuvarla(indirgenmisDeger),
    });
  }

  return {
    gerekliAylikTutar: gerekliTutar,
    birikimDetay: {
      toplamBirikim: yuvarla(S),
      hedefKonutDegeri: yuvarla(F_hedef),
      yeterliMi: S >= F_hedef,
      fark: yuvarla(S - F_hedef),
      gerekliAylikTutar: gerekliTutar,
    },
    nakitAkislari: aylikNakitAkisi,
    toplamKira,
    rawToplamOdeme,
    rawMaliyetNBD,
  };
}

// ── Mode: piyangoKarsilastir (original mode) ────────────────────────
// Redirects Evim installments (+ org fee) to a savings account and checks
// whether the accumulated sum covers the asset value at hedefAy.
//
// The last month (t = hedefAy) has taksit = 0 because at that point the
// investor buys the asset rather than saving. This is intentional: the
// savings FV only includes contributions from months 1..hedefAy-1.
function hesaplaPiyangoModu(
  common: CommonParams,
  evim: EvimParams,
  birikim: BirikimParams,
): ModeResult {
  const { F, P } = common;
  const R = common.R ?? 0;
  const K_0 = common.K_0 ?? 0;
  const r_kira = common.r_kira ?? 0;
  const r_ev = common.r_ev;

  const { r_mevduat } = birikim;
  const hedefAy = birikim.hedefAy!;
  const { O_oran, n_e, taksitPlani, orgUcretPesinOrani = 0.50, t_teslim } = evim;

  // T=0 lump sum that would go to Evim → now invested
  const finansmanTutari = F - P;
  const O_toplam = finansmanTutari * O_oran;
  const O_pesin = O_toplam * orgUcretPesinOrani;
  const lumpSum = P + O_pesin;

  // Step 1: Future value of investments (S_mevduat)
  let S_mevduat = lumpSum * Math.pow(1 + r_mevduat, hedefAy);

  for (let t = 1; t <= hedefAy - 1; t++) {
    const taksit = getTaksit(taksitPlani, t, n_e, t_teslim);
    S_mevduat += taksit * Math.pow(1 + r_mevduat, hedefAy - t);
  }

  // Step 2: Asset value at target month
  const F_hedef = varlikDegeri(F, r_ev, hedefAy);

  // Step 3: Sufficiency check
  const fark = S_mevduat - F_hedef;
  const yeterliMi = fark >= 0;

  // Step 4: Build cash flow and track raw totals
  let toplamKira = 0;
  let rawToplamOdeme = lumpSum;
  let rawMaliyetNBD = lumpSum;
  let kumulatifCikis = lumpSum;
  const aylikNakitAkisi: NakitAkisi[] = [];

  for (let t = 1; t <= hedefAy; t++) {
    const taksit = t < hedefAy ? getTaksit(taksitPlani, t, n_e, t_teslim) : 0;

    let kira = 0;
    if (K_0 > 0) {
      kira = getKira(K_0, r_kira, t);
      toplamKira += kira;
    }

    const toplamCikis = taksit + kira;
    kumulatifCikis += toplamCikis;
    const indirgenmisDeger = indirge(toplamCikis, R, t);

    rawToplamOdeme += toplamCikis;
    rawMaliyetNBD += indirgenmisDeger;

    aylikNakitAkisi.push({
      ay: t,
      taksit: yuvarla(taksit),
      kira: yuvarla(kira),
      sigortaEkMaliyet: 0,
      orgUcretTaksit: 0,
      toplamCikis: yuvarla(toplamCikis),
      kumulatifCikis: yuvarla(kumulatifCikis),
      indirgenmisDeger: yuvarla(indirgenmisDeger),
    });
  }

  return {
    birikimDetay: {
      toplamBirikim: yuvarla(S_mevduat),
      hedefKonutDegeri: yuvarla(F_hedef),
      yeterliMi,
      fark: yuvarla(fark),
    },
    nakitAkislari: aylikNakitAkisi,
    toplamKira,
    rawToplamOdeme,
    rawMaliyetNBD,
  };
}

// ── Public API ──────────────────────────────────────────────────────

export function hesaplaBirikimNBD(
  common: CommonParams,
  evim: EvimParams,
  birikim: BirikimParams,
): ModelSonuc {
  const R = common.R ?? 0;
  const { mod } = birikim;

  if (mod === 'ayHesapla') {
    const result = hesaplaAyModu(common, birikim);

    return {
      maliyetNBD: yuvarla(result.rawMaliyetNBD),
      toplamOdeme: yuvarla(result.rawToplamOdeme),
      toplamKira: yuvarla(result.toplamKira),
      aylikNakitAkisi: result.nakitAkislari,
      birikim: result.birikimDetay,
    };
  }

  if (mod === 'tutarHesapla') {
    const result = hesaplaTutarModu(common, birikim);

    return {
      maliyetNBD: yuvarla(result.rawMaliyetNBD),
      toplamOdeme: yuvarla(result.rawToplamOdeme),
      toplamKira: yuvarla(result.toplamKira),
      aylikNakitAkisi: result.nakitAkislari,
      birikim: { ...result.birikimDetay, gerekliAylikTutar: result.gerekliAylikTutar },
    };
  }

  // piyangoKarsilastir mode (original)
  const result = hesaplaPiyangoModu(common, evim, birikim);

  // Shortfall or surplus adjustment (uses raw birikimDetay values for precision)
  const hedefAy = birikim.hedefAy!;
  const rawBirikim = result.birikimDetay.toplamBirikim;
  const rawHedef = result.birikimDetay.hedefKonutDegeri;
  const eksik = Math.max(0, rawHedef - rawBirikim);
  const fazla = Math.max(0, rawBirikim - rawHedef);

  let maliyetNBD = result.rawMaliyetNBD;
  let toplamOdeme = result.rawToplamOdeme;
  maliyetNBD += indirge(eksik, R, hedefAy);
  maliyetNBD -= indirge(fazla, R, hedefAy);
  toplamOdeme += eksik;
  toplamOdeme -= fazla;

  return {
    maliyetNBD: yuvarla(maliyetNBD),
    toplamOdeme: yuvarla(toplamOdeme),
    toplamKira: yuvarla(result.toplamKira),
    aylikNakitAkisi: result.nakitAkislari,
    birikim: result.birikimDetay,
  };
}
