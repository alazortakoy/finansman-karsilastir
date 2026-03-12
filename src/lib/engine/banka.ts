import type { CommonParams, BankaParams, ModelSonuc, NakitAkisi } from './types';
import { annuite, indirge, yuvarla } from './helpers';

/**
 * Calculates the bank loan model result (MaliyetNBD).
 *
 * SPEC.md Section 3.2:
 *  - T=0: down payment + one-time costs, asset acquired immediately
 *  - T=1..n_b: monthly effective installment (annuity + BSMV on interest portion)
 *  - Every 12 months: annual insurance costs
 *  - No rent cost (asset is acquired at T=0)
 */
export function hesaplaBankaNBD(
  common: CommonParams,
  banka: BankaParams,
): ModelSonuc {
  const { F, P } = common;
  const R = common.R ?? 0;
  const {
    r_b,
    n_b,
    dosyaMasrafi = 0,
    ekspertizUcreti = 0,
    ipotekTesisUcreti = 0,
    bsmvOrani = 0.05,
    daskYillik = 0,
    konutSigortaYillik = 0,
    hayatSigortaYillik = 0,
  } = banka;

  // Step 1: Loan amount
  const C = F - P;

  // Step 2: Monthly annuity payment
  const A_b = annuite(C, r_b, n_b);

  // Step 4: One-time costs at T=0
  const tekSeferlik = dosyaMasrafi + ekspertizUcreti + ipotekTesisUcreti;

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
    const efektifTaksit = A_b + bsmv;

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
