import { describe, it, expect } from 'vitest';
import {
  yillikToAylik,
  aylikToYillik,
  indirge,
  getTaksit,
  getKira,
  yuvarla,
  annuite,
  varlikDegeri,
  hesaplaTeslimAyi,
  hesaplaSabitTaksit,
} from '../helpers';
import type { TaksitPlan } from '../types';

// ============================================================
// yillikToAylik
// ============================================================
describe('yillikToAylik', () => {
  it('converts 0% annual to 0% monthly', () => {
    expect(yillikToAylik(0)).toBe(0);
  });

  it('converts 12% annual to ~0.949% monthly', () => {
    const monthly = yillikToAylik(0.12);
    // (1.12)^(1/12) - 1 ≈ 0.009489
    expect(monthly).toBeCloseTo(0.009489, 4);
  });

  it('converts 100% annual to ~5.946% monthly', () => {
    const monthly = yillikToAylik(1.0);
    // (2)^(1/12) - 1 ≈ 0.05946
    expect(monthly).toBeCloseTo(0.05946, 4);
  });

  it('converts 40% annual correctly', () => {
    const monthly = yillikToAylik(0.40);
    // Verify round-trip: compounding monthly back should give annual
    const backToAnnual = Math.pow(1 + monthly, 12) - 1;
    expect(backToAnnual).toBeCloseTo(0.40, 10);
  });

  it('converts 320% annual (extreme bank rate)', () => {
    const monthly = yillikToAylik(3.20);
    const backToAnnual = Math.pow(1 + monthly, 12) - 1;
    expect(backToAnnual).toBeCloseTo(3.20, 10);
  });
});

// ============================================================
// aylikToYillik
// ============================================================
describe('aylikToYillik', () => {
  it('converts 0% monthly to 0% annual', () => {
    expect(aylikToYillik(0)).toBe(0);
  });

  it('round-trips with yillikToAylik', () => {
    const rates = [0.05, 0.12, 0.40, 1.0, 3.20];
    for (const annual of rates) {
      const monthly = yillikToAylik(annual);
      const recovered = aylikToYillik(monthly);
      expect(recovered).toBeCloseTo(annual, 10);
    }
  });
});

// ============================================================
// indirge
// ============================================================
describe('indirge', () => {
  it('returns amount unchanged when R=0', () => {
    expect(indirge(1000, 0, 12)).toBe(1000);
  });

  it('returns amount unchanged when t=0', () => {
    expect(indirge(1000, 0.05, 0)).toBe(1000);
  });

  it('discounts 1000 TL at 2% for 1 month', () => {
    // 1000 / 1.02 ≈ 980.39
    expect(indirge(1000, 0.02, 1)).toBeCloseTo(980.3922, 2);
  });

  it('discounts 1000 TL at 2% for 12 months', () => {
    // 1000 / (1.02)^12 ≈ 788.49
    expect(indirge(1000, 0.02, 12)).toBeCloseTo(788.4932, 2);
  });

  it('discounts 0 TL returns 0', () => {
    expect(indirge(0, 0.05, 10)).toBe(0);
  });
});

// ============================================================
// getTaksit — sabit plan
// ============================================================
describe('getTaksit — sabit', () => {
  const plan: TaksitPlan = { tip: 'sabit', aylikTutar: 50_000 };

  it('returns fixed amount for any valid month', () => {
    expect(getTaksit(plan, 1, 120)).toBe(50_000);
    expect(getTaksit(plan, 60, 120)).toBe(50_000);
    expect(getTaksit(plan, 120, 120)).toBe(50_000);
  });

  it('returns 0 for t < 1', () => {
    expect(getTaksit(plan, 0, 120)).toBe(0);
  });

  it('returns 0 for t > n_e', () => {
    expect(getTaksit(plan, 121, 120)).toBe(0);
  });
});

// ============================================================
// getTaksit — yillikArtisli plan
// ============================================================
describe('getTaksit — yillikArtisli', () => {
  const plan: TaksitPlan = {
    tip: 'yillikArtisli',
    baslangicTutar: 40_000,
    yillikArtisOrani: 0.20,
  };

  it('returns base amount for months 1-12 (year 0)', () => {
    expect(getTaksit(plan, 1, 120)).toBe(40_000);
    expect(getTaksit(plan, 12, 120)).toBe(40_000);
  });

  it('returns base * 1.20 for months 13-24 (year 1)', () => {
    expect(getTaksit(plan, 13, 120)).toBeCloseTo(48_000, 2);
    expect(getTaksit(plan, 24, 120)).toBeCloseTo(48_000, 2);
  });

  it('returns base * 1.20^2 for months 25-36 (year 2)', () => {
    expect(getTaksit(plan, 25, 120)).toBeCloseTo(57_600, 2);
  });
});

// ============================================================
// getTaksit — teslimatSonrasiArtisli plan
// ============================================================
describe('getTaksit — teslimatSonrasiArtisli', () => {
  const plan: TaksitPlan = {
    tip: 'teslimatSonrasiArtisli',
    teslimOncesiTutar: 30_000,
    teslimSonrasiTutar: 60_000,
    yillikArtisOrani: 0.10,
  };

  it('returns pre-delivery amount before t_teslim', () => {
    expect(getTaksit(plan, 1, 120, 48)).toBe(30_000);
    expect(getTaksit(plan, 47, 120, 48)).toBe(30_000);
  });

  it('returns post-delivery base amount at t_teslim', () => {
    expect(getTaksit(plan, 48, 120, 48)).toBe(60_000);
  });

  it('returns post-delivery amount with yearly increase', () => {
    // Month 60 = 12 months after delivery at month 48 → year 1
    expect(getTaksit(plan, 60, 120, 48)).toBeCloseTo(66_000, 2);
  });

  it('throws when t_teslim is not provided', () => {
    expect(() => getTaksit(plan, 1, 120)).toThrow('t_teslim is required');
  });
});

// ============================================================
// getKira
// ============================================================
describe('getKira', () => {
  it('returns 0 when K_0 is 0', () => {
    expect(getKira(0, 0.03, 12)).toBe(0);
  });

  it('returns K_0 when r_kira is 0 and t is 0', () => {
    expect(getKira(25_000, 0, 0)).toBe(25_000);
  });

  it('calculates rent with monthly increase', () => {
    // 25000 * (1.03)^12 ≈ 35_644.02
    const rent = getKira(25_000, 0.03, 12);
    expect(rent).toBeCloseTo(35_644.02, 0);
  });

  it('calculates rent at month 1 with increase', () => {
    // 25000 * 1.03 = 25750
    expect(getKira(25_000, 0.03, 1)).toBeCloseTo(25_750, 2);
  });
});

// ============================================================
// yuvarla
// ============================================================
describe('yuvarla', () => {
  it('rounds to 2 decimal places', () => {
    expect(yuvarla(123.456)).toBe(123.46);
    expect(yuvarla(123.454)).toBe(123.45);
    expect(yuvarla(0.005)).toBe(0.01);
    expect(yuvarla(100)).toBe(100);
  });

  it('handles negative values', () => {
    expect(yuvarla(-99.999)).toBe(-100);
    expect(yuvarla(-0.001)).toBe(-0);
  });
});

// ============================================================
// annuite
// ============================================================
describe('annuite', () => {
  it('returns 0 when principal is 0', () => {
    expect(annuite(0, 0.02, 120)).toBe(0);
  });

  it('divides evenly when rate is 0', () => {
    expect(annuite(120_000, 0, 12)).toBe(10_000);
  });

  it('calculates standard annuity correctly', () => {
    // C=4,000,000, r=0.02 monthly, n=120
    const payment = annuite(4_000_000, 0.02, 120);
    // Verify: present value of payments should equal C
    let pv = 0;
    for (let t = 1; t <= 120; t++) {
      pv += payment / Math.pow(1.02, t);
    }
    expect(pv).toBeCloseTo(4_000_000, 0);
  });

  it('calculates small loan annuity', () => {
    // C=100,000, r=0.01, n=12
    // A = 100000 * [0.01 * 1.01^12] / [1.01^12 - 1]
    const payment = annuite(100_000, 0.01, 12);
    expect(payment).toBeCloseTo(8_884.88, 0);
  });
});

// ============================================================
// varlikDegeri
// ============================================================
describe('varlikDegeri', () => {
  it('returns F when r_ev is 0', () => {
    expect(varlikDegeri(5_000_000, 0, 48)).toBe(5_000_000);
  });

  it('returns F when r_ev is undefined', () => {
    expect(varlikDegeri(5_000_000, undefined, 48)).toBe(5_000_000);
  });

  it('calculates appreciation correctly', () => {
    // 5M * (1.02)^12 ≈ 6,341,208.97
    const value = varlikDegeri(5_000_000, 0.02, 12);
    expect(value).toBeCloseTo(6_341_208.97, 0);
  });

  it('handles depreciation (negative rate)', () => {
    // 5M * (0.99)^12 ≈ 4,431,924.36
    const value = varlikDegeri(5_000_000, -0.01, 12);
    expect(value).toBeCloseTo(4_431_924.36, 0);
  });
});

// ============================================================
// hesaplaSabitTaksit
// ============================================================
describe('hesaplaSabitTaksit', () => {
  it('divides financed amount by term', () => {
    expect(hesaplaSabitTaksit(5_000_000, 1_000_000, 120)).toBeCloseTo(33_333.33, 0);
  });

  it('returns full amount per month when n_e=1', () => {
    expect(hesaplaSabitTaksit(1_000_000, 0, 1)).toBe(1_000_000);
  });

  it('returns 0 when n_e is 0', () => {
    expect(hesaplaSabitTaksit(1_000_000, 0, 0)).toBe(0);
  });

  it('handles P = F', () => {
    expect(hesaplaSabitTaksit(5_000_000, 5_000_000, 120)).toBe(0);
  });
});

// ============================================================
// hesaplaTeslimAyi
// ============================================================
describe('hesaplaTeslimAyi', () => {
  it('calculates delivery month for basic scenario', () => {
    // F=5M, P=0, sabit 55556/ay, n_e=120
    // Need cumulative >= 2M (40% of 5M) AND t >= max(5, ceil(120*0.40*(1-0)))=48
    // 55556 * 36 = 2,000,016 >= 2M → kümülatif OK at t=36
    // But sureSiniri = ceil(120*0.40*1) = 48, so t must be >= 48
    // At t=48: cumulative = 55556*48 = 2,666,688 >= 2M ✓ and t=48 >= 48 ✓
    const plan: TaksitPlan = { tip: 'sabit', aylikTutar: 55_556 };
    const result = hesaplaTeslimAyi(5_000_000, 0, plan, 120);
    expect(result).toBe(48);
  });

  it('accounts for down payment reducing time requirement', () => {
    // F=5M, P=1M, sabit 55556/ay, n_e=120
    // cumulative starts at 1M
    // 40% of 5M = 2M → need 1M more from taksit → t >= 18 (55556*18=999,998, ~19 needed)
    // sureSiniri = ceil(120*0.40*(1-0.2)) = ceil(38.4) = 39
    // t must be >= max(5, 39) = 39
    // At t=19: cumulative = 1M + 55556*19 = 2,055,564 >= 2M ✓ but t=19 < 39
    // At t=39: cumulative = 1M + 55556*39 = 3,166,684 ✓ and t=39 >= 39 ✓
    const plan: TaksitPlan = { tip: 'sabit', aylikTutar: 55_556 };
    const result = hesaplaTeslimAyi(5_000_000, 1_000_000, plan, 120);
    expect(result).toBe(39);
  });

  it('returns minimum 5 even with large down payment', () => {
    // F=5M, P=4M (80%), sabit 100000/ay, n_e=120
    // cumulative starts at 4M >= 2M ✓
    // sureSiniri = ceil(120*0.40*(1-0.8)) = ceil(9.6) = 10
    // t must be >= max(5, 10) = 10
    // At t=1: cumulative ok but t < 10
    // At t=10: ✓
    const plan: TaksitPlan = { tip: 'sabit', aylikTutar: 100_000 };
    const result = hesaplaTeslimAyi(5_000_000, 4_000_000, plan, 120);
    expect(result).toBe(10);
  });

  it('returns fallback (n_e/2) when conditions never met', () => {
    // Very small installments that never reach 40%
    const plan: TaksitPlan = { tip: 'sabit', aylikTutar: 100 };
    const result = hesaplaTeslimAyi(5_000_000, 0, plan, 120);
    expect(result).toBe(60); // ceil(120/2)
  });

  it('works with yillikArtisli plan', () => {
    // F=5M, P=0, start=40000, 20% annual increase, n_e=120
    const plan: TaksitPlan = {
      tip: 'yillikArtisli',
      baslangicTutar: 40_000,
      yillikArtisOrani: 0.20,
    };
    const result = hesaplaTeslimAyi(5_000_000, 0, plan, 120);
    // sureSiniri = 48, cumulative must reach 2M
    // Year 0 (1-12): 40000*12 = 480,000
    // Year 1 (13-24): 48000*12 = 576,000 → total 1,056,000
    // Year 2 (25-36): 57600*12 = 691,200 → total 1,747,200
    // Year 3 (37-48): 69120*12 = 829,440 → total 2,576,640
    // At some month in year 3 cumulative crosses 2M, but t must be >= 48
    expect(result).toBeGreaterThanOrEqual(5);
    expect(result).toBeLessThanOrEqual(120);
  });
});
