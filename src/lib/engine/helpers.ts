import type { TaksitPlan } from './types';

/**
 * Converts an annual compound rate to its monthly equivalent.
 * Formula: (1 + annual)^(1/12) - 1
 */
export function yillikToAylik(yillik: number): number {
  return Math.pow(1 + yillik, 1 / 12) - 1;
}

/** Alias with a more descriptive English name. */
export const annualToMonthlyCompound = yillikToAylik;

/**
 * Converts a monthly compound rate to its annual equivalent.
 * Formula: (1 + monthly)^12 - 1
 */
export function aylikToYillik(aylik: number): number {
  return Math.pow(1 + aylik, 12) - 1;
}

/**
 * Normalizes a credit interest rate to a monthly compound rate.
 *
 * @param rate   The raw rate value (decimal, e.g. 0.0254 for 2.54%)
 * @param period Whether the rate is 'monthly' (use directly) or 'annual' (compound-convert)
 * @returns Monthly compound rate (decimal)
 */
export function normalizeCreditMonthlyRate(
  rate: number,
  period: 'monthly' | 'annual' = 'monthly',
): number {
  if (period === 'annual') return yillikToAylik(rate);
  return rate;
}

/**
 * Discounts a cash flow at month t to present value.
 * Formula: amount / (1 + R)^t
 * When R = 0, returns the amount unchanged (no discounting).
 */
export function indirge(nakit: number, R: number, t: number): number {
  if (R === 0 || t === 0) return nakit;
  return nakit / Math.pow(1 + R, t);
}

/**
 * Returns the installment amount for month t given a payment plan.
 *
 * For 'teslimatSonrasiArtisli', t_teslim must be provided.
 */
export function getTaksit(
  plan: TaksitPlan,
  t: number,
  n_e: number,
  t_teslim?: number,
): number {
  if (t < 1 || t > n_e) return 0;

  switch (plan.tip) {
    case 'sabit':
      return plan.aylikTutar;

    case 'yillikArtisli': {
      const yil = Math.floor((t - 1) / 12);
      return plan.baslangicTutar * Math.pow(1 + plan.yillikArtisOrani, yil);
    }

    case 'teslimatSonrasiArtisli': {
      if (t_teslim === undefined) {
        throw new Error('t_teslim is required for teslimatSonrasiArtisli plan');
      }
      if (t < t_teslim) {
        return plan.teslimOncesiTutar;
      }
      const yilSonrasi = Math.floor((t - t_teslim) / 12);
      return plan.teslimSonrasiTutar * Math.pow(1 + plan.yillikArtisOrani, yilSonrasi);
    }
  }
}

/**
 * Calculates the rent amount at month t with compound growth.
 * Month 1 returns exactly K_0 (today's rent). Growth starts from month 2.
 * Formula: K_0 * (1 + r_kira)^(t - 1)
 */
export function getKira(K_0: number, r_kira: number, t: number): number {
  if (K_0 === 0) return 0;
  if (t <= 0) return K_0;
  return K_0 * Math.pow(1 + r_kira, t - 1);
}

/**
 * Rounds a monetary value to 2 decimal places.
 */
export function yuvarla(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculates the annuity (fixed monthly payment) for a loan.
 * Formula: C × [r × (1+r)^n] / [(1+r)^n - 1]
 * Returns 0 when principal is 0.
 */
export function annuite(C: number, r: number, n: number): number {
  if (C === 0) return 0;
  if (r === 0) return C / n;
  const factor = Math.pow(1 + r, n);
  return C * (r * factor) / (factor - 1);
}

/**
 * Calculates the future value of an asset.
 * Formula: F * (1 + r_ev)^t
 * When r_ev is 0 or undefined, returns F unchanged.
 */
export function varlikDegeri(F: number, r_ev: number | undefined, t: number): number {
  if (!r_ev || r_ev === 0) return F;
  return F * Math.pow(1 + r_ev, t);
}

/**
 * Calculates the fixed monthly installment for Evim sabit plan.
 * Simply divides financed amount by term months.
 * Formula: (F - P) / n_e
 */
export function hesaplaSabitTaksit(F: number, P: number, n_e: number): number {
  if (n_e <= 0) return 0;
  return (F - P) / n_e;
}

/**
 * Estimates the earliest delivery month for Evim (çekilişsiz) using a
 * heuristic based on typical industry practice.
 *
 * ⚠️ This is NOT an official formula or regulatory guarantee. Actual delivery
 * dates depend on the specific company, plan, and market conditions.
 *
 * Heuristic rules (configurable assumption):
 *  - Cumulative savings (P + installments) >= 40% of F
 *  - t >= max(5, ceil(n_e * 0.40 * (1 - P/F)))
 * Deterministic fallback when conditions are never met: ceil(n_e / 2)
 */
export function estimateDeliveryMonth(
  F: number,
  P: number,
  plan: TaksitPlan,
  n_e: number,
): number {
  let kumulatifTasarruf = P;

  for (let t = 1; t <= n_e; t++) {
    const taksit = getTaksit(plan, t, n_e);
    kumulatifTasarruf += taksit;

    const kosul1 = kumulatifTasarruf >= F * 0.40;
    const sureSiniri = Math.ceil(n_e * 0.40 * (1 - P / F));
    const kosul2 = t >= Math.max(5, sureSiniri);

    if (kosul1 && kosul2) {
      return t;
    }
  }

  return Math.ceil(n_e / 2);
}

/** @deprecated Use estimateDeliveryMonth instead */
export const hesaplaTeslimAyi = estimateDeliveryMonth;
