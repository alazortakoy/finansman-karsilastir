import { describe, it, expect } from 'vitest';
import { hesaplaBankaNBD } from '../banka';
import { annuite, indirge, yillikToAylik, yuvarla } from '../helpers';
import type { CommonParams, BankaParams } from '../types';

// ============================================================
// Helper: build params with defaults
// ============================================================
function makeCommon(overrides: Partial<CommonParams> = {}): CommonParams {
  return {
    F: 5_000_000,
    P: 1_000_000,
    assetType: 'konut',
    ...overrides,
  };
}

function makeBanka(overrides: Partial<BankaParams> = {}): BankaParams {
  return {
    r_b: yillikToAylik(3.20), // ~320% annual → monthly
    n_b: 120,
    bsmvOrani: 0,   // konut default
    kkdfOrani: 0,    // konut default
    ipotekHarciOrani: 0, // disable for tests unless specified
    ...overrides,
  };
}

// ============================================================
// Basic structure and output shape
// ============================================================
describe('hesaplaBankaNBD — output structure', () => {
  it('returns all required ModelSonuc fields', () => {
    const result = hesaplaBankaNBD(makeCommon(), makeBanka());

    expect(result).toHaveProperty('maliyetNBD');
    expect(result).toHaveProperty('toplamOdeme');
    expect(result).toHaveProperty('toplamFaiz');
    expect(result).toHaveProperty('toplamKira', 0);
    expect(result).toHaveProperty('aylikNakitAkisi');
    expect(result.aylikNakitAkisi).toHaveLength(120);
  });

  it('each cash flow entry has correct shape', () => {
    const result = hesaplaBankaNBD(makeCommon(), makeBanka());
    const entry = result.aylikNakitAkisi[0];

    expect(entry).toHaveProperty('ay', 1);
    expect(entry).toHaveProperty('taksit');
    expect(entry).toHaveProperty('kira', 0);
    expect(entry).toHaveProperty('sigortaEkMaliyet');
    expect(entry).toHaveProperty('orgUcretTaksit', 0);
    expect(entry).toHaveProperty('toplamCikis');
    expect(entry).toHaveProperty('kumulatifCikis');
    expect(entry).toHaveProperty('indirgenmisDeger');
  });
});

// ============================================================
// Loan amount (C = F - P)
// ============================================================
describe('hesaplaBankaNBD — loan basics', () => {
  it('uses C = F - P for calculations', () => {
    const common = makeCommon({ F: 5_000_000, P: 1_000_000 });
    const banka = makeBanka({ r_b: 0.02, n_b: 12, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    // C = 4M, verify annuity matches
    const expectedPayment = annuite(4_000_000, 0.02, 12);
    expect(result.aylikNakitAkisi[0].taksit).toBeCloseTo(expectedPayment, 0);
  });

  it('handles zero loan (P = F)', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000 });
    const banka = makeBanka();
    const result = hesaplaBankaNBD(common, banka);

    expect(result.toplamFaiz).toBe(0);
    expect(result.maliyetNBD).toBe(5_000_000);
    expect(result.toplamOdeme).toBe(5_000_000);
  });
});

// ============================================================
// BSMV calculation
// ============================================================
describe('hesaplaBankaNBD — BSMV', () => {
  it('adds BSMV on interest portion each month', () => {
    const common = makeCommon({ F: 1_100_000, P: 100_000, R: 0 });
    const banka = makeBanka({ r_b: 0.01, n_b: 12, bsmvOrani: 0.05 });
    const result = hesaplaBankaNBD(common, banka);

    // C = 1M, r_b = 0.01
    const A_b = annuite(1_000_000, 0.01, 12);
    // Month 1: interest = 1M * 0.01 = 10,000, BSMV = 500
    const expectedTaksit1 = A_b + 10_000 * 0.05;
    expect(result.aylikNakitAkisi[0].taksit).toBeCloseTo(expectedTaksit1, 0);
  });

  it('BSMV decreases over time as interest portion shrinks', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.02, n_b: 60, bsmvOrani: 0.05 });
    const result = hesaplaBankaNBD(common, banka);

    const firstTaksit = result.aylikNakitAkisi[0].taksit;
    const lastTaksit = result.aylikNakitAkisi[59].taksit;

    // First installment should be higher than last (more interest early on)
    expect(firstTaksit).toBeGreaterThan(lastTaksit);
  });

  it('with bsmvOrani=0, effective installment equals annuity', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.01, n_b: 12, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    const C = common.F - common.P;
    const A_b = annuite(C, 0.01, 12);
    // Every installment should equal A_b (ignoring last-month close-out difference)
    for (let i = 0; i < result.aylikNakitAkisi.length - 1; i++) {
      const entry = result.aylikNakitAkisi[i];
      if (entry.sigortaEkMaliyet === 0) {
        expect(entry.taksit).toBeCloseTo(A_b, 0);
      }
    }
  });
});

// ============================================================
// KKDF calculation (tüketici/araç kredisi)
// ============================================================
describe('hesaplaBankaNBD — KKDF', () => {
  it('adds KKDF on interest for araç kredisi', () => {
    const common = makeCommon({ F: 1_100_000, P: 100_000, R: 0, assetType: 'arac' });
    const banka = makeBanka({ r_b: 0.01, n_b: 12, bsmvOrani: 0.15, kkdfOrani: 0.15 });
    const result = hesaplaBankaNBD(common, banka);

    // C = 1M, Month 1: interest = 10,000
    // BSMV = 1,500, KKDF = 1,500
    const A_b = annuite(1_000_000, 0.01, 12);
    const expectedTaksit1 = A_b + 10_000 * 0.15 + 10_000 * 0.15;
    expect(result.aylikNakitAkisi[0].taksit).toBeCloseTo(expectedTaksit1, 0);
  });

  it('KKDF is 0 for konut kredisi by default', () => {
    const common = makeCommon({ assetType: 'konut' });
    const banka = makeBanka({ r_b: 0.01, n_b: 12 });
    const result = hesaplaBankaNBD(common, banka);

    const C = common.F - common.P;
    const A_b = annuite(C, 0.01, 12);
    // First month — no insurance yet at month 1 because insurance is separate
    // With bsmv=0, kkdf=0, taksit should equal pure annuity (ignoring insurance)
    const entry = result.aylikNakitAkisi[0];
    // Month 1 has insurance, so check taksit only
    expect(entry.taksit).toBeCloseTo(A_b, 0);
  });
});

// ============================================================
// One-time costs at T=0
// ============================================================
describe('hesaplaBankaNBD — one-time costs', () => {
  it('includes one-time costs in maliyetNBD and toplamOdeme', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000, R: 0 });
    const banka = makeBanka({
      r_b: 0.01,
      n_b: 12,
      dosyaMasrafi: 15_000,
      ekspertizUcreti: 5_000,
      ipotekHarciOrani: 0, // C=0, so no ipotek anyway
    });
    const result = hesaplaBankaNBD(common, banka);

    // P=F → no loan, just down payment + one-time costs
    expect(result.maliyetNBD).toBe(5_000_000 + 15_000 + 5_000);
    expect(result.toplamOdeme).toBe(5_000_000 + 15_000 + 5_000);
  });

  it('includes ipotek harci as percentage of loan amount', () => {
    const common = makeCommon({ F: 5_000_000, P: 1_000_000, R: 0 });
    const banka = makeBanka({
      r_b: 0.01,
      n_b: 12,
      dosyaMasrafi: 0,
      ekspertizUcreti: 0,
      ipotekHarciOrani: 0.00455, // binde 4.55 on C=4M → 18,200
    });
    const result = hesaplaBankaNBD(common, banka);

    // ipotek harci = 4,000,000 * 0.00455 = 18,200
    expect(result.toplamOdeme).toBeGreaterThan(1_000_000 + 18_200);
  });
});

// ============================================================
// Annual recurring costs (insurance) — starts at month 1
// ============================================================
describe('hesaplaBankaNBD — annual insurance costs', () => {
  it('adds insurance costs at months 1, 13, ... (starts at month 1)', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({
      r_b: 0.01,
      n_b: 24,
      bsmvOrani: 0,
      daskYillik: 1_000,
      konutSigortaYillik: 2_000,
      hayatSigortaYillik: 500,
    });
    const result = hesaplaBankaNBD(common, banka);

    // Month 1 should include insurance (first premium)
    expect(result.aylikNakitAkisi[0].sigortaEkMaliyet).toBe(3_500);
    // Month 13 should include insurance (second premium)
    expect(result.aylikNakitAkisi[12].sigortaEkMaliyet).toBe(3_500);
    // Month 6 should NOT include insurance
    expect(result.aylikNakitAkisi[5].sigortaEkMaliyet).toBe(0);
    // Month 12 should NOT include insurance (no longer at month 12)
    expect(result.aylikNakitAkisi[11].sigortaEkMaliyet).toBe(0);
  });

  it('insurance costs are included in toplamOdeme', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000, R: 0 });
    const banka = makeBanka({
      r_b: 0.01,
      n_b: 24,
      bsmvOrani: 0,
      daskYillik: 1_000,
    });
    const result = hesaplaBankaNBD(common, banka);

    // P=F, no loan, so toplamOdeme = P + 2 years of DASK (months 1 and 13)
    expect(result.toplamOdeme).toBe(5_000_000 + 1_000 * 2);
  });
});

// ============================================================
// creditRatePeriod — period-aware rate handling
// ============================================================
describe('hesaplaBankaNBD — creditRatePeriod', () => {
  it('same numeric value produces very different results for annual vs monthly', () => {
    const common = makeCommon({ R: 0 });
    const bankaMonthly = makeBanka({ r_b: 0.0254, n_b: 120, bsmvOrani: 0, creditRatePeriod: 'monthly' });
    const bankaAnnual = makeBanka({ r_b: 0.0254, n_b: 120, bsmvOrani: 0, creditRatePeriod: 'annual' });

    const resultMonthly = hesaplaBankaNBD(common, bankaMonthly);
    const resultAnnual = hesaplaBankaNBD(common, bankaAnnual);

    // 2.54% monthly ≈ 35% annual → much higher cost
    // 2.54% annual ≈ 0.21% monthly → much lower cost
    expect(resultMonthly.toplamOdeme).toBeGreaterThan(resultAnnual.toplamOdeme * 2);
  });

  it('defaults to monthly when not specified (backward compatible)', () => {
    const common = makeCommon({ R: 0 });
    const banka1 = makeBanka({ r_b: 0.02, n_b: 12, bsmvOrani: 0 });
    const banka2 = makeBanka({ r_b: 0.02, n_b: 12, bsmvOrani: 0, creditRatePeriod: 'monthly' });

    const r1 = hesaplaBankaNBD(common, banka1);
    const r2 = hesaplaBankaNBD(common, banka2);

    expect(r1.maliyetNBD).toBe(r2.maliyetNBD);
    expect(r1.toplamOdeme).toBe(r2.toplamOdeme);
  });
});

// ============================================================
// Last-month residual — principal closes to 0
// ============================================================
describe('hesaplaBankaNBD — last-month residual', () => {
  it('remaining principal is effectively 0 after final payment', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.02, n_b: 120, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    // Verify total principal paid equals C = F - P
    const C = common.F - common.P;
    const A = annuite(C, 0.02, 120);
    // Sum of all installments should approximate C + total interest
    const totalPaid = result.aylikNakitAkisi.reduce((s, e) => s + e.taksit, 0);
    expect(totalPaid).toBeCloseTo(result.toplamFaiz! + C, 0);
  });
});

// ============================================================
// NPV / Discounting
// ============================================================
describe('hesaplaBankaNBD — NPV discounting', () => {
  it('with R=0, maliyetNBD equals toplamOdeme', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.02, n_b: 60, bsmvOrani: 0.05 });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 0);
  });

  it('with R>0, maliyetNBD is less than toplamOdeme', () => {
    const R = yillikToAylik(0.40);
    const common = makeCommon({ R });
    const banka = makeBanka({ r_b: 0.02, n_b: 60, bsmvOrani: 0.05 });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBeLessThan(result.toplamOdeme);
  });

  it('higher discount rate results in lower maliyetNBD', () => {
    const common1 = makeCommon({ R: yillikToAylik(0.20) });
    const common2 = makeCommon({ R: yillikToAylik(0.60) });
    const banka = makeBanka({ r_b: 0.02, n_b: 60 });

    const result1 = hesaplaBankaNBD(common1, banka);
    const result2 = hesaplaBankaNBD(common2, banka);

    expect(result2.maliyetNBD).toBeLessThan(result1.maliyetNBD);
  });

  it('NPV of individual cash flows is correct', () => {
    const R = 0.02;
    const common = makeCommon({ R });
    const banka = makeBanka({ r_b: 0.01, n_b: 6, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    for (const entry of result.aylikNakitAkisi) {
      const expected = indirge(entry.toplamCikis, R, entry.ay);
      expect(entry.indirgenmisDeger).toBeCloseTo(expected, 0);
    }
  });
});

// ============================================================
// Total interest
// ============================================================
describe('hesaplaBankaNBD — toplamFaiz', () => {
  it('total interest is positive for nonzero loan', () => {
    const result = hesaplaBankaNBD(makeCommon(), makeBanka());
    expect(result.toplamFaiz).toBeGreaterThan(0);
  });

  it('total interest is consistent with amortization', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.01, n_b: 12, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    const C = common.F - common.P;
    // Total principal paid should equal C
    // Total interest = toplamOdeme - P - tekSeferlik - C - insurance
    // Simpler: verify toplamFaiz is positive and consistent
    expect(result.toplamFaiz!).toBeGreaterThan(0);
    expect(result.toplamFaiz!).toBeLessThan(C); // Interest < principal for 12 months at 1%
  });
});

// ============================================================
// Cumulative cash flow
// ============================================================
describe('hesaplaBankaNBD — cumulative cash flow', () => {
  it('kumulatifCikis increases monotonically', () => {
    const result = hesaplaBankaNBD(makeCommon(), makeBanka());

    for (let i = 1; i < result.aylikNakitAkisi.length; i++) {
      expect(result.aylikNakitAkisi[i].kumulatifCikis)
        .toBeGreaterThanOrEqual(result.aylikNakitAkisi[i - 1].kumulatifCikis);
    }
  });

  it('final kumulatifCikis equals toplamOdeme', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({ r_b: 0.02, n_b: 24, bsmvOrani: 0.05 });
    const result = hesaplaBankaNBD(common, banka);

    const lastEntry = result.aylikNakitAkisi[result.aylikNakitAkisi.length - 1];
    expect(lastEntry.kumulatifCikis).toBeCloseTo(result.toplamOdeme, 0);
  });
});

// ============================================================
// SPEC.md 9.1 — Reference test scenario
// ============================================================
describe('hesaplaBankaNBD — SPEC 9.1 scenario', () => {
  it('matches expected behavior for F=5M, P=1M, r_b=320%, n_b=120', () => {
    const R = yillikToAylik(0.40);
    const common = makeCommon({ F: 5_000_000, P: 1_000_000, R });
    const banka = makeBanka({
      r_b: yillikToAylik(3.20),
      n_b: 120,
      bsmvOrani: 0.05,
    });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBeGreaterThan(0);
    expect(result.toplamOdeme).toBeGreaterThan(5_000_000);
    expect(result.aylikNakitAkisi).toHaveLength(120);
    expect(result.toplamFaiz!).toBeGreaterThan(0);
  });
});

// ============================================================
// Edge case: P = F (full cash payment)
// ============================================================
describe('hesaplaBankaNBD — edge case: P = F', () => {
  it('no loan, maliyetNBD = F when no extra costs', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000, R: 0 });
    const banka = makeBanka({ bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBe(5_000_000);
    expect(result.toplamOdeme).toBe(5_000_000);
    expect(result.toplamFaiz).toBe(0);
  });
});

// ============================================================
// R=0 means no discounting
// ============================================================
describe('hesaplaBankaNBD — R=0 no discounting', () => {
  it('maliyetNBD equals nominal sum when R=0', () => {
    const common = makeCommon({ R: 0 });
    const banka = makeBanka({
      r_b: 0.02,
      n_b: 24,
      bsmvOrani: 0.05,
      dosyaMasrafi: 10_000,
      daskYillik: 1_000,
    });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 2);
  });
});

// ============================================================
// R undefined treated as 0
// ============================================================
describe('hesaplaBankaNBD — R undefined', () => {
  it('treats undefined R as 0 (no discounting)', () => {
    const common = makeCommon({ R: undefined });
    const banka = makeBanka({ r_b: 0.01, n_b: 12, bsmvOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 2);
  });
});
