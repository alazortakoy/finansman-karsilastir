import type { CommonParams, BankaParams, ModelSonuc, NakitAkisi } from './types';
import { annuite, indirge, yuvarla } from './helpers';

/**
 * Calculates the bank loan model result (MaliyetNBD).
 *
 * Key rules from mevzuat:
 *  - Konut kredisi: BSMV exempt (istisna), KKDF = 0%
 *  - Tüketici/araç kredisi: BSMV = 15% on interest, KKDF = 15% on interest
 *  - İpotek tesis harcı: binde 4.55 of loan amount (one-time)
 *
 * Flow:
 *  - T=0: down payment + one-time costs (dosya, ekspertiz, ipotek harcı), asset acquired immediately
 *  - T=1..n_b: monthly effective installment (annuity + BSMV + KKDF on interest portion)
 *  - Every 12 months: annual insurance costs
 *  - No rent cost (asset is acquired at T=0)
 */
export function hesaplaBankaNBD(
  common: CommonParams,
  banka: BankaParams,
): ModelSonuc {
  const { F, P, assetType } = common;
  const R = common.R ?? 0;

  // Determine defaults based on asset type (konut vs araç/tüketici)
  const isKonut = assetType === 'konut';
  const defaultBsmv = isKonut ? 0 : 0.15;
  const defaultKkdf = isKonut ? 0 : 0.15;

  const {
    r_b,
    n_b,
    dosyaMasrafi = 0,
    ekspertizUcreti = 0,
    ipotekHarciOrani = 0.00455,   // binde 4.55
    bsmvOrani = defaultBsmv,
    kkdfOrani = defaultKkdf,
    daskYillik = 0,
    konutSigortaYillik = 0,
    hayatSigortaYillik = 0,
  } = banka;

  // Step 1: Loan amount
  const C = F - P;

  // Step 2: Monthly annuity payment
  const A_b = annuite(C, r_b, n_b);

  // Step 4: One-time costs at T=0
  const ipotekHarci = C * ipotekHarciOrani;
  const tekSeferlik = dosyaMasrafi + ekspertizUcreti + ipotekHarci;

  // Step 5: Annual recurring insurance costs
  const yillikEkMaliyet = daskYillik + konutSigortaYillik + hayatSigortaYillik;

  // Build amortization table and cash flow
  let kalanAnapara = C;
  let toplamFaiz = 0;
  let toplamOdeme = P + tekSeferlik;
  let maliyetNBD = P + tekSeferlik;
  let kumulatifCikis = P + tekSeferlik;

  const aylikNakitAkisi: NakitAkisi[] = [];

  for (let t = 1; t <= n_b; t++) {
    // Step 3: Amortization — interest/principal split
    const faizPayi = kalanAnapara * r_b;
    const anaparaPayi = A_b - faizPayi;
    const bsmv = faizPayi * bsmvOrani;
    const kkdf = faizPayi * kkdfOrani;
    const efektifTaksit = A_b + bsmv + kkdf;

    kalanAnapara -= anaparaPayi;
    toplamFaiz += faizPayi;

    // Annual insurance at t = 12, 24, 36, ...
    const sigortaEkMaliyet = (t % 12 === 0) ? yillikEkMaliyet : 0;

    const toplamCikis = efektifTaksit + sigortaEkMaliyet;
    kumulatifCikis += toplamCikis;
    toplamOdeme += toplamCikis;

    const indirgenmisDeger = indirge(toplamCikis, R, t);
    maliyetNBD += indirgenmisDeger;

    aylikNakitAkisi.push({
      ay: t,
      taksit: yuvarla(efektifTaksit),
      kira: 0,
      sigortaEkMaliyet: yuvarla(sigortaEkMaliyet),
      orgUcretTaksit: 0,
      toplamCikis: yuvarla(toplamCikis),
      kumulatifCikis: yuvarla(kumulatifCikis),
      indirgenmisDeger: yuvarla(indirgenmisDeger),
    });
  }

  return {
    maliyetNBD: yuvarla(maliyetNBD),
    toplamOdeme: yuvarla(toplamOdeme),
    toplamFaiz: yuvarla(toplamFaiz),
    toplamKira: 0,
    aylikNakitAkisi,
  };
}
