import type { CommonParams, EvimParams, ModelSonuc, NakitAkisi } from './types';
import { getTaksit, getKira, indirge, yuvarla } from './helpers';

/**
 * Calculates the Evim (savings-finance) model result (MaliyetNBD).
 *
 * SPEC.md Section 3.3:
 *  - T=0: down payment + org fee (cash portion)
 *  - T=1..t_teslim-1: installments + rent (minus rent support) + org fee installments
 *  - T=t_teslim..n_e: post-delivery installments + annual insurance
 *
 * The delayed ownership effect (waiting cost) is NOT added as a synthetic
 * adjustment. It is naturally reflected through rent payments during the
 * waiting period and the timing of discounted cash flows.
 */
export function hesaplaEvimNBD(
  common: CommonParams,
  evim: EvimParams,
): ModelSonuc {
  const { F, P } = common;
  const R = common.R ?? 0;
  const K_0 = common.K_0 ?? 0;
  const r_kira = common.r_kira ?? 0;
  const {
    O_oran,
    n_e,
    t_teslim,
    taksitPlani,
    kiraDestegi = 0,
    orgUcretPesinOrani = 0.50,
    orgUcretTaksitSayisi = 4,
    daskYillik = 0,
    konutSigortaYillik = 0,
    hayatSigortaYillik = 0,
  } = evim;

  // Step 1: Organization fee (based on financed amount, not total asset value)
  const finansmanTutari = F - P;
  const O_toplam = finansmanTutari * O_oran;
  const O_pesin = O_toplam * orgUcretPesinOrani;
  const orgTaksitSayisi = orgUcretTaksitSayisi > 0 ? orgUcretTaksitSayisi : 0;
  const O_taksit = orgTaksitSayisi > 0
    ? (O_toplam - O_pesin) / orgTaksitSayisi
    : 0;

  // Step 2: T=0 cash outflow
  const nakitCikisT0 = P + O_pesin;

  // Annual insurance total
  const yillikEkMaliyet = daskYillik + konutSigortaYillik + hayatSigortaYillik;

  // Accumulators
  let toplamOdeme = nakitCikisT0;
  let maliyetNBD = nakitCikisT0;
  let toplamKira = 0;
  let kumulatifCikis = nakitCikisT0;

  const aylikNakitAkisi: NakitAkisi[] = [];

  for (let t = 1; t <= n_e; t++) {
    let taksit = 0;
    let kira = 0;
    let orgTaksitAy = 0;
    let sigortaEkMaliyet = 0;

    if (t < t_teslim) {
      // Step 4: Waiting period — installment + rent + org fee installments
      taksit = getTaksit(taksitPlani, t, n_e, t_teslim);

      // Rent with support deduction
      if (K_0 > 0) {
        const brutKira = getKira(K_0, r_kira, t);
        kira = Math.max(0, brutKira - kiraDestegi);
        toplamKira += kira;
      }

      // Org fee installments (Step 3)
      if (t <= orgTaksitSayisi) {
        orgTaksitAy = O_taksit;
      }
    } else {
      // Step 6: Post-delivery installments
      taksit = getTaksit(taksitPlani, t, n_e, t_teslim);

      // Annual insurance: starting at delivery, then every 12 months
      const monthsSinceDelivery = t - t_teslim;
      if (monthsSinceDelivery >= 0 && monthsSinceDelivery % 12 === 0) {
        sigortaEkMaliyet = yillikEkMaliyet;
      }
    }

    const toplamCikis = taksit + kira + orgTaksitAy + sigortaEkMaliyet;
    kumulatifCikis += toplamCikis;
    toplamOdeme += toplamCikis;

    const indirgenmisDeger = indirge(toplamCikis, R, t);
    maliyetNBD += indirgenmisDeger;

    aylikNakitAkisi.push({
      ay: t,
      taksit: yuvarla(taksit),
      kira: yuvarla(kira),
      sigortaEkMaliyet: yuvarla(sigortaEkMaliyet),
      orgUcretTaksit: yuvarla(orgTaksitAy),
      toplamCikis: yuvarla(toplamCikis),
      kumulatifCikis: yuvarla(kumulatifCikis),
      indirgenmisDeger: yuvarla(indirgenmisDeger),
    });
  }

  return {
    maliyetNBD: yuvarla(maliyetNBD),
    toplamOdeme: yuvarla(toplamOdeme),
    toplamOrgUcreti: yuvarla(O_toplam),
    toplamKira: yuvarla(toplamKira),
    aylikNakitAkisi,
  };
}
