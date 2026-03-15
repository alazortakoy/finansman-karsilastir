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

    // No loan → all installments are 0 (or near-zero due to BSMV on 0 interest)
    expect(result.toplamFaiz).toBe(0);
    expect(result.maliyetNBD).toBe(5_000_000); // Just the down payment
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

    // Month 2: kalanAnapara = 1M - (A_b - 10000)
    const kalanAnapara1 = 1_000_000 - (A_b - 10_000);
    const faiz2 = kalanAnapara1 * 0.01;
    const expectedTaksit2 = A_b + faiz2 * 0.05;
    expect(result.aylikNakitAkisi[1].taksit).toBeCloseTo(expectedTaksit2, 0);
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
    // Every installment should equal A_b
    for (const entry of result.aylikNakitAkisi) {
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
    // efektifTaksit = A_b + 1500 + 1500
    const A_b = annuite(1_000_000, 0.01, 12);
    const expectedTaksit1 = A_b + 10_000 * 0.15 + 10_000 * 0.15;
    expect(result.aylikNakitAkisi[0].taksit).toBeCloseTo(expectedTaksit1, 0);
  });

  it('KKDF is 0 for konut kredisi by default', () => {
    const common = makeCommon({ assetType: 'konut' });
    // Using default kkdfOrani=0 from makeBanka
    const banka = makeBanka({ r_b: 0.01, n_b: 12 });
    const result = hesaplaBankaNBD(common, banka);

    // With both bsmvOrani=0 and kkdfOrani=0, taksit should equal pure annuity
    const C = common.F - common.P;
    const A_b = annuite(C, 0.01, 12);
    expect(result.aylikNakitAkisi[0].taksit).toBeCloseTo(A_b, 0);
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
    // toplamOdeme includes P + ipotekHarci + installments
    expect(result.toplamOdeme).toBeGreaterThan(1_000_000 + 18_200);
  });
});

// ============================================================
// Annual recurring costs (insurance)
// ============================================================
describe('hesaplaBankaNBD — annual insurance costs', () => {
  it('adds insurance costs at months 12, 24, ...', () => {
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

    // Month 12 should include insurance
    expect(result.aylikNakitAkisi[11].sigortaEkMaliyet).toBe(3_500);
    // Month 24 should include insurance
    expect(result.aylikNakitAkisi[23].sigortaEkMaliyet).toBe(3_500);
    // Month 6 should NOT include insurance
    expect(result.aylikNakitAkisi[5].sigortaEkMaliyet).toBe(0);
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

    // P=F, no loan, so toplamOdeme = P + 2 years of DASK
    expect(result.toplamOdeme).toBe(5_000_000 + 1_000 * 2);
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

    // Verify each entry's discounted value
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
    const A_b = annuite(C, 0.01, 12);
    // Total payments = A_b * 12, total interest = total payments - C
    const expectedInterest = A_b * 12 - C;
    expect(result.toplamFaiz).toBeCloseTo(expectedInterest, 0);
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

    // C = 4,000,000
    // MaliyetNBD must be positive
    expect(result.maliyetNBD).toBeGreaterThan(0);
    // Total payment must exceed F (interest-bearing loan)
    expect(result.toplamOdeme).toBeGreaterThan(5_000_000);
    // Cash flow length must equal n_b
    expect(result.aylikNakitAkisi).toHaveLength(120);
    // Total interest must be positive
    expect(result.toplamFaiz!).toBeGreaterThan(0);
  });
});

// ============================================================
// SPEC.md 9.5 — Edge case: P = F (full cash payment)
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
// SPEC.md 9.4 — R=0 means no discounting
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
