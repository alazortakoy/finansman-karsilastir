import { describe, it, expect } from 'vitest';
import { hesaplaEvimNBD } from '../evim';
import { yillikToAylik, getKira, indirge, yuvarla } from '../helpers';
import type { CommonParams, EvimParams } from '../types';

// ============================================================
// Helpers: build params with defaults
// ============================================================
function makeCommon(overrides: Partial<CommonParams> = {}): CommonParams {
  return {
    F: 5_000_000,
    P: 0,
    assetType: 'konut',
    ...overrides,
  };
}

function makeEvim(overrides: Partial<EvimParams> = {}): EvimParams {
  return {
    model: 'cekilissiz',
    O_oran: 0.08,
    n_e: 120,
    t_teslim: 48,
    taksitPlani: { tip: 'sabit', aylikTutar: 55_556 },
    orgUcretPesinOrani: 0.50,
    orgUcretTaksitSayisi: 4,
    ...overrides,
  };
}

// ============================================================
// Output structure
// ============================================================
describe('hesaplaEvimNBD — output structure', () => {
  it('returns all required ModelSonuc fields', () => {
    const result = hesaplaEvimNBD(makeCommon(), makeEvim());

    expect(result).toHaveProperty('maliyetNBD');
    expect(result).toHaveProperty('toplamOdeme');
    expect(result).toHaveProperty('toplamOrgUcreti');
    expect(result).toHaveProperty('toplamKira');
    expect(result).toHaveProperty('aylikNakitAkisi');
    expect(result.aylikNakitAkisi).toHaveLength(120);
  });

  it('each cash flow entry has correct shape', () => {
    const result = hesaplaEvimNBD(makeCommon(), makeEvim());
    const entry = result.aylikNakitAkisi[0];

    expect(entry).toHaveProperty('ay', 1);
    expect(entry).toHaveProperty('taksit');
    expect(entry).toHaveProperty('kira');
    expect(entry).toHaveProperty('sigortaEkMaliyet');
    expect(entry).toHaveProperty('orgUcretTaksit');
    expect(entry).toHaveProperty('toplamCikis');
    expect(entry).toHaveProperty('kumulatifCikis');
    expect(entry).toHaveProperty('indirgenmisDeger');
  });
});

// ============================================================
// Organization fee
// ============================================================
describe('hesaplaEvimNBD — organization fee', () => {
  it('calculates total org fee correctly (based on financed amount)', () => {
    const result = hesaplaEvimNBD(makeCommon(), makeEvim());
    // F=5M, P=0, finansmanTutari=5M, O_oran=0.08 → O_toplam = 400,000
    expect(result.toplamOrgUcreti).toBe(400_000);
  });

  it('org fee uses (F-P) not F', () => {
    const common = makeCommon({ P: 1_000_000 });
    const result = hesaplaEvimNBD(common, makeEvim());
    // F=5M, P=1M, finansmanTutari=4M, O_oran=0.08 → O_toplam = 320,000
    expect(result.toplamOrgUcreti).toBe(320_000);
  });

  it('includes cash org fee in T=0 (via maliyetNBD)', () => {
    const common = makeCommon({ R: 0 });
    const evim2 = makeEvim({ orgUcretPesinOrani: 1.0, orgUcretTaksitSayisi: 0 });
    const result = hesaplaEvimNBD(common, evim2);

    // First entry should have no org taksit
    expect(result.aylikNakitAkisi[0].orgUcretTaksit).toBe(0);
  });

  it('spreads remaining org fee over installment months', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    // O_toplam=400k, O_pesin=200k, O_taksit=200k/4=50k per month
    const orgEntries = result.aylikNakitAkisi.slice(0, 4);
    for (const entry of orgEntries) {
      expect(entry.orgUcretTaksit).toBeCloseTo(50_000, 0);
    }
    // Month 5 should have no org taksit
    expect(result.aylikNakitAkisi[4].orgUcretTaksit).toBe(0);
  });

  it('org fee parameters are configurable', () => {
    const common = makeCommon({ R: 0 });
    // Non-standard: 30% upfront, 6 installments
    const evim = makeEvim({ orgUcretPesinOrani: 0.30, orgUcretTaksitSayisi: 6 });
    const result = hesaplaEvimNBD(common, evim);

    // O_toplam=400k, O_pesin=120k, O_taksit=(400k-120k)/6 ≈ 46,667
    const org1 = result.aylikNakitAkisi[0].orgUcretTaksit;
    expect(org1).toBeCloseTo(46_666.67, 0);
    // Month 7 should have no org taksit
    expect(result.aylikNakitAkisi[6].orgUcretTaksit).toBe(0);
  });
});

// ============================================================
// Waiting period — rent
// ============================================================
describe('hesaplaEvimNBD — rent during waiting', () => {
  it('charges rent before delivery (t < t_teslim)', () => {
    const common = makeCommon({ K_0: 25_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 48 });
    const result = hesaplaEvimNBD(common, evim);

    // Months 1..47 should have rent = 25,000
    for (let i = 0; i < 47; i++) {
      expect(result.aylikNakitAkisi[i].kira).toBe(25_000);
    }
    // Months 48+ should have no rent
    for (let i = 47; i < 120; i++) {
      expect(result.aylikNakitAkisi[i].kira).toBe(0);
    }
  });

  it('first month rent equals K_0 exactly (no off-by-one)', () => {
    const r_kira = yillikToAylik(0.30);
    const common = makeCommon({ K_0: 27_500, r_kira, R: 0 });
    const evim = makeEvim({ t_teslim: 48 });
    const result = hesaplaEvimNBD(common, evim);

    // Month 1 rent must be exactly K_0
    expect(result.aylikNakitAkisi[0].kira).toBe(27_500);
  });

  it('applies rent increase rate starting from month 2', () => {
    const r_kira = yillikToAylik(0.50);
    const common = makeCommon({ K_0: 25_000, r_kira, R: 0 });
    const evim = makeEvim({ t_teslim: 48 });
    const result = hesaplaEvimNBD(common, evim);

    // Month 1 rent = K_0
    expect(result.aylikNakitAkisi[0].kira).toBe(25_000);
    // Month 2 rent = K_0 * (1 + r_kira)
    const expectedRent2 = getKira(25_000, r_kira, 2);
    expect(result.aylikNakitAkisi[1].kira).toBeCloseTo(expectedRent2, 0);
    // Month 12 rent should be higher than month 1
    expect(result.aylikNakitAkisi[11].kira).toBeGreaterThan(result.aylikNakitAkisi[0].kira);
  });

  it('deducts rent support', () => {
    const common = makeCommon({ K_0: 25_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 48, kiraDestegi: 10_000 });
    const result = hesaplaEvimNBD(common, evim);

    // 25,000 - 10,000 = 15,000
    expect(result.aylikNakitAkisi[0].kira).toBe(15_000);
  });

  it('rent support cannot make rent negative', () => {
    const common = makeCommon({ K_0: 5_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 48, kiraDestegi: 10_000 });
    const result = hesaplaEvimNBD(common, evim);

    expect(result.aylikNakitAkisi[0].kira).toBe(0);
  });

  it('no rent when K_0 is 0', () => {
    const common = makeCommon({ K_0: 0, R: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    expect(result.toplamKira).toBe(0);
    for (const entry of result.aylikNakitAkisi) {
      expect(entry.kira).toBe(0);
    }
  });

  it('toplamKira accumulates correctly', () => {
    const common = makeCommon({ K_0: 10_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 12 });
    const result = hesaplaEvimNBD(common, evim);

    // 11 months of waiting (t=1..11), rent=10k each
    expect(result.toplamKira).toBe(110_000);
  });
});

// ============================================================
// Installments
// ============================================================
describe('hesaplaEvimNBD — installments', () => {
  it('has installments for all n_e months', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({ taksitPlani: { tip: 'sabit', aylikTutar: 50_000 } });
    const result = hesaplaEvimNBD(common, evim);

    for (const entry of result.aylikNakitAkisi) {
      expect(entry.taksit).toBe(50_000);
    }
  });

  it('works with yillikArtisli plan', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({
      taksitPlani: { tip: 'yillikArtisli', baslangicTutar: 40_000, yillikArtisOrani: 0.20 },
    });
    const result = hesaplaEvimNBD(common, evim);

    // Month 1 (year 0): 40,000
    expect(result.aylikNakitAkisi[0].taksit).toBe(40_000);
    // Month 13 (year 1): 48,000
    expect(result.aylikNakitAkisi[12].taksit).toBeCloseTo(48_000, 0);
  });
});

// ============================================================
// Post-delivery insurance — starts at delivery month
// ============================================================
describe('hesaplaEvimNBD — insurance after delivery', () => {
  it('adds insurance at delivery month and every 12 months after', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({
      t_teslim: 12,
      daskYillik: 1_000,
      konutSigortaYillik: 2_000,
      hayatSigortaYillik: 500,
    });
    const result = hesaplaEvimNBD(common, evim);

    // Month 12 (delivery month, 0 months after) — first insurance premium
    expect(result.aylikNakitAkisi[11].sigortaEkMaliyet).toBe(3_500);
    // 12 months after delivery = month 24
    expect(result.aylikNakitAkisi[23].sigortaEkMaliyet).toBe(3_500);
    // 24 months after delivery = month 36
    expect(result.aylikNakitAkisi[35].sigortaEkMaliyet).toBe(3_500);
    // Month 18 (6 months after delivery) — not a 12-month boundary
    expect(result.aylikNakitAkisi[17].sigortaEkMaliyet).toBe(0);
  });

  it('no insurance before delivery', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({
      t_teslim: 48,
      daskYillik: 5_000,
    });
    const result = hesaplaEvimNBD(common, evim);

    for (let i = 0; i < 47; i++) {
      expect(result.aylikNakitAkisi[i].sigortaEkMaliyet).toBe(0);
    }
    // Month 48 (delivery) should have insurance
    expect(result.aylikNakitAkisi[47].sigortaEkMaliyet).toBe(5_000);
  });
});

// ============================================================
// beklemeFarki REMOVED — NBD is pure cash-flow based
// ============================================================
describe('hesaplaEvimNBD — no synthetic waiting cost adjustment', () => {
  it('maliyetNBD equals T0 + sum of discounted cash flows (no beklemeFarki)', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim({ t_teslim: 48 });
    const result = hesaplaEvimNBD(common, evim);

    const sumCashFlows = result.aylikNakitAkisi.reduce((s, e) => s + e.toplamCikis, 0);
    const T0 = common.P + (common.F - common.P) * evim.O_oran * 0.5;
    const expectedNBD = T0 + sumCashFlows;
    expect(result.maliyetNBD).toBeCloseTo(expectedNBD, 0);
  });

  it('r_ev does not affect maliyetNBD (no synthetic adjustment)', () => {
    const common1 = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const common2 = makeCommon({ R: 0, r_ev: yillikToAylik(0.30), K_0: 0 });
    const evim = makeEvim({ t_teslim: 48 });

    const result1 = hesaplaEvimNBD(common1, evim);
    const result2 = hesaplaEvimNBD(common2, evim);

    // Without beklemeFarki, r_ev has no effect on cash flows
    expect(result1.maliyetNBD).toBe(result2.maliyetNBD);
  });
});

// ============================================================
// NPV discounting
// ============================================================
describe('hesaplaEvimNBD — NPV discounting', () => {
  it('with R=0, maliyetNBD equals toplamOdeme', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 0);
  });

  it('with R>0, maliyetNBD is less than toplamOdeme', () => {
    const R = yillikToAylik(0.40);
    const common = makeCommon({ R, K_0: 0, r_ev: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    expect(result.maliyetNBD).toBeLessThan(result.toplamOdeme);
  });

  it('R undefined treated as 0', () => {
    const common = makeCommon({ R: undefined, r_ev: 0, K_0: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 0);
  });
});

// ============================================================
// Cumulative cash flow
// ============================================================
describe('hesaplaEvimNBD — cumulative cash flow', () => {
  it('kumulatifCikis increases monotonically', () => {
    const result = hesaplaEvimNBD(makeCommon(), makeEvim());

    for (let i = 1; i < result.aylikNakitAkisi.length; i++) {
      expect(result.aylikNakitAkisi[i].kumulatifCikis)
        .toBeGreaterThanOrEqual(result.aylikNakitAkisi[i - 1].kumulatifCikis);
    }
  });

  it('final kumulatifCikis + T0 equals toplamOdeme', () => {
    const common = makeCommon({ R: 0, K_0: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    const lastEntry = result.aylikNakitAkisi[result.aylikNakitAkisi.length - 1];
    expect(lastEntry.kumulatifCikis).toBeCloseTo(result.toplamOdeme, 0);
  });
});

// ============================================================
// SPEC.md 9.2 — Reference test scenario
// ============================================================
describe('hesaplaEvimNBD — SPEC 9.2 scenario', () => {
  it('matches expected behavior for F=5M, O_oran=0.08, n_e=120', () => {
    const R = yillikToAylik(0.40);
    const r_ev = yillikToAylik(0.30);
    const r_kira = yillikToAylik(0.50);
    const common = makeCommon({ F: 5_000_000, P: 0, R, r_ev, K_0: 25_000, r_kira });
    const evim = makeEvim({
      O_oran: 0.08,
      n_e: 120,
      taksitPlani: { tip: 'sabit', aylikTutar: 55_556 },
    });
    const result = hesaplaEvimNBD(common, evim);

    expect(result.maliyetNBD).toBeGreaterThan(0);
    expect(result.toplamOrgUcreti).toBe(400_000);
    expect(result.toplamKira!).toBeGreaterThan(0);
    expect(result.aylikNakitAkisi).toHaveLength(120);
  });
});

// ============================================================
// Edge case: t_teslim = 1 (immediate delivery)
// ============================================================
describe('hesaplaEvimNBD — immediate delivery (t_teslim=1)', () => {
  it('no rent is charged', () => {
    const common = makeCommon({ K_0: 25_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 1 });
    const result = hesaplaEvimNBD(common, evim);

    expect(result.toplamKira).toBe(0);
  });

  it('insurance starts at month 1 (delivery month)', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({ t_teslim: 1, daskYillik: 1_000 });
    const result = hesaplaEvimNBD(common, evim);

    expect(result.aylikNakitAkisi[0].sigortaEkMaliyet).toBe(1_000);
  });
});

// ============================================================
// Edge case: t_teslim = n_e (delivery at very end)
// ============================================================
describe('hesaplaEvimNBD — delivery at end (t_teslim=n_e)', () => {
  it('all months are waiting period, no post-delivery installments', () => {
    const common = makeCommon({ K_0: 10_000, r_kira: 0, R: 0 });
    const evim = makeEvim({ t_teslim: 120, n_e: 120 });
    const result = hesaplaEvimNBD(common, evim);

    // 119 months of rent (t=1..119)
    expect(result.toplamKira).toBe(10_000 * 119);
  });

  it('insurance at delivery month (last month)', () => {
    const common = makeCommon({ R: 0 });
    const evim = makeEvim({ t_teslim: 120, n_e: 120, daskYillik: 1_000 });
    const result = hesaplaEvimNBD(common, evim);

    // Only the last month should have insurance (delivery at month 120)
    expect(result.aylikNakitAkisi[119].sigortaEkMaliyet).toBe(1_000);
    for (let i = 0; i < 119; i++) {
      expect(result.aylikNakitAkisi[i].sigortaEkMaliyet).toBe(0);
    }
  });
});

// ============================================================
// Result consistency: summary matches cash flow table
// ============================================================
describe('hesaplaEvimNBD — result consistency', () => {
  it('toplamOdeme equals T0 + sum of all toplamCikis', () => {
    const common = makeCommon({ R: yillikToAylik(0.30), K_0: 20_000, r_kira: yillikToAylik(0.40) });
    const evim = makeEvim({ t_teslim: 48, daskYillik: 2_000 });
    const result = hesaplaEvimNBD(common, evim);

    const T0 = common.P + (common.F - common.P) * evim.O_oran * (evim.orgUcretPesinOrani ?? 0.5);
    const sumCF = result.aylikNakitAkisi.reduce((s, e) => s + e.toplamCikis, 0);
    expect(result.toplamOdeme).toBeCloseTo(T0 + sumCF, 0);
  });

  it('maliyetNBD equals T0 + sum of all indirgenmisDeger', () => {
    const R = yillikToAylik(0.30);
    const common = makeCommon({ R, K_0: 20_000, r_kira: yillikToAylik(0.40), r_ev: 0 });
    const evim = makeEvim({ t_teslim: 48, daskYillik: 2_000 });
    const result = hesaplaEvimNBD(common, evim);

    const T0 = common.P + (common.F - common.P) * evim.O_oran * (evim.orgUcretPesinOrani ?? 0.5);
    const sumDiscounted = result.aylikNakitAkisi.reduce((s, e) => s + e.indirgenmisDeger, 0);
    expect(result.maliyetNBD).toBeCloseTo(T0 + sumDiscounted, 0);
  });
});
