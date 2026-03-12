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
 * Calculates the "save-it-yourself" model result (MaliyetNBD).
 *
 * SPEC.md Section 3.4:
 *  - T=0: invest P + O_pesin instead of paying Evim
 *  - T=1..hedefAy-1: invest monthly installments (same as Evim taksit)
 *  - T=1..hedefAy: pay rent (no asset until purchase)
 *  - T=hedefAy: buy asset cash — shortfall added, surplus subtracted
 *
 * Requires Evim params to know which cash flows would be redirected.
 */
export function hesaplaBirikimNBD(
  common: CommonParams,
  evim: EvimParams,
  birikim: BirikimParams,
): ModelSonuc {
  const { F, P } = common;
  const R = common.R ?? 0;
  const K_0 = common.K_0 ?? 0;
  const r_kira = common.r_kira ?? 0;
  const r_ev = common.r_ev;

  const { r_mevduat, hedefAy } = birikim;
  const { O_oran, n_e, taksitPlani, orgUcretPesinOrani = 0.50, t_teslim } = evim;

  // T=0 lump sum that would go to Evim → now invested
  const O_toplam = F * O_oran;
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

  // Step 4: MaliyetNBD
  let maliyetNBD = lumpSum; // T=0 opportunity cost
  let toplamOdeme = lumpSum;
  let toplamKira = 0;
  let kumulatifCikis = lumpSum;

  const aylikNakitAkisi: NakitAkisi[] = [];

  for (let t = 1; t <= hedefAy; t++) {
    // Monthly investment (same installment as Evim, t=1..hedefAy-1)
    const taksit = t < hedefAy ? getTaksit(taksitPlani, t, n_e, t_teslim) : 0;

    // Rent for full waiting period (t=1..hedefAy)
    let kira = 0;
    if (K_0 > 0) {
      kira = getKira(K_0, r_kira, t);
      toplamKira += kira;
    }

    const toplamCikis = taksit + kira;
    kumulatifCikis += toplamCikis;
    toplamOdeme += toplamCikis;

    const indirgenmisDeger = indirge(toplamCikis, R, t);
    maliyetNBD += indirgenmisDeger;

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

  // Shortfall or surplus at hedefAy
  const eksik = Math.max(0, F_hedef - S_mevduat);
  const fazla = Math.max(0, S_mevduat - F_hedef);
  maliyetNBD += indirge(eksik, R, hedefAy);
  maliyetNBD -= indirge(fazla, R, hedefAy);
  toplamOdeme += eksik;
  toplamOdeme -= fazla;

  const birikimDetay: BirikimDetay = {
    toplamBirikim: yuvarla(S_mevduat),
    hedefKonutDegeri: yuvarla(F_hedef),
    yeterliMi,
    fark: yuvarla(fark),
  };

  return {
    maliyetNBD: yuvarla(maliyetNBD),
    toplamOdeme: yuvarla(toplamOdeme),
    toplamKira: yuvarla(toplamKira),
    aylikNakitAkisi,
    birikim: birikimDetay,
  };
}
