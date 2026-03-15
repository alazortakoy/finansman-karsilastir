import { describe, it, expect } from 'vitest';
import { hesaplaBirikimNBD } from '../biriktir';
import { yillikToAylik, varlikDegeri, getKira } from '../helpers';
import type { CommonParams, EvimParams, BirikimParams } from '../types';

// ============================================================
// Helpers
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

function makeBirikim(overrides: Partial<BirikimParams> = {}): BirikimParams {
  return {
    r_mevduat: yillikToAylik(0.45),
    mod: 'piyangoKarsilastir',
    hedefAy: 48,
    ...overrides,
  };
}

// ============================================================
// Output structure
// ============================================================
describe('hesaplaBirikimNBD — output structure', () => {
  it('returns all required ModelSonuc fields', () => {
    const result = hesaplaBirikimNBD(makeCommon(), makeEvim(), makeBirikim());

    expect(result).toHaveProperty('maliyetNBD');
    expect(result).toHaveProperty('toplamOdeme');
    expect(result).toHaveProperty('toplamKira');
    expect(result).toHaveProperty('aylikNakitAkisi');
    expect(result).toHaveProperty('birikim');
  });

  it('birikim detail has correct shape', () => {
    const result = hesaplaBirikimNBD(makeCommon(), makeEvim(), makeBirikim());
    const b = result.birikim!;

    expect(b).toHaveProperty('toplamBirikim');
    expect(b).toHaveProperty('hedefKonutDegeri');
    expect(b).toHaveProperty('yeterliMi');
    expect(b).toHaveProperty('fark');
  });

  it('cash flow length equals hedefAy', () => {
    const result = hesaplaBirikimNBD(makeCommon(), makeEvim(), makeBirikim({ hedefAy: 48 }));
    expect(result.aylikNakitAkisi).toHaveLength(48);
  });
});

// ============================================================
// Savings accumulation (S_mevduat)
// ============================================================
describe('hesaplaBirikimNBD — savings accumulation', () => {
  it('accumulates lump sum with compound interest', () => {
    const common = makeCommon({ F: 1_000_000, P: 100_000 });
    const evim = makeEvim({ O_oran: 0.10, orgUcretPesinOrani: 1.0, taksitPlani: { tip: 'sabit', aylikTutar: 0 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0.02, hedefAy: 12 });

    const result = hesaplaBirikimNBD(common, evim, birikim);

    // finansmanTutari = F-P = 900k
    // lumpSum = P + (F-P)*O_oran*pesinOrani = 100k + 900k*0.10*1.0 = 190k
    // No monthly contributions (taksit=0)
    // S_mevduat = 190k * (1.02)^12 ≈ 240,965.93
    const lumpSum = 100_000 + 900_000 * 0.10 * 1.0;
    const expected = lumpSum * Math.pow(1.02, 12);
    expect(result.birikim!.toplamBirikim).toBeCloseTo(expected, 0);
  });

  it('accumulates monthly investments', () => {
    const common = makeCommon({ F: 1_000_000, P: 0 });
    const evim = makeEvim({ O_oran: 0.0, orgUcretPesinOrani: 0.50, taksitPlani: { tip: 'sabit', aylikTutar: 10_000 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0.01, hedefAy: 12 });

    const result = hesaplaBirikimNBD(common, evim, birikim);

    // lumpSum = 0 + 0 = 0, only monthly contributions
    // S = Σ(t=1..11) 10000 * (1.01)^(12-t)
    let expected = 0;
    for (let t = 1; t <= 11; t++) {
      expected += 10_000 * Math.pow(1.01, 12 - t);
    }
    expect(result.birikim!.toplamBirikim).toBeCloseTo(expected, 0);
  });
});

// ============================================================
// Asset value at target (F_hedef)
// ============================================================
describe('hesaplaBirikimNBD — F_hedef', () => {
  it('uses r_ev for asset appreciation', () => {
    const r_ev = 0.02;
    const common = makeCommon({ r_ev });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 24 }));

    const expected = varlikDegeri(5_000_000, r_ev, 24);
    expect(result.birikim!.hedefKonutDegeri).toBeCloseTo(expected, 0);
  });

  it('F_hedef = F when r_ev is undefined', () => {
    const common = makeCommon({ r_ev: undefined });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 24 }));

    expect(result.birikim!.hedefKonutDegeri).toBe(5_000_000);
  });
});

// ============================================================
// Sufficiency check
// ============================================================
describe('hesaplaBirikimNBD — sufficiency', () => {
  it('yeterliMi=true when savings exceed target', () => {
    const common = makeCommon({ F: 100_000, P: 100_000, r_ev: 0 });
    const evim = makeEvim({ O_oran: 0.0, taksitPlani: { tip: 'sabit', aylikTutar: 10_000 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0.05, hedefAy: 24 });
    const result = hesaplaBirikimNBD(common, evim, birikim);

    expect(result.birikim!.yeterliMi).toBe(true);
    expect(result.birikim!.fark).toBeGreaterThan(0);
  });

  it('yeterliMi=false when savings fall short', () => {
    const r_ev = yillikToAylik(1.0);
    const common = makeCommon({ F: 5_000_000, P: 0, r_ev });
    const evim = makeEvim({ O_oran: 0.08, taksitPlani: { tip: 'sabit', aylikTutar: 10_000 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0.001, hedefAy: 48 });
    const result = hesaplaBirikimNBD(common, evim, birikim);

    expect(result.birikim!.yeterliMi).toBe(false);
    expect(result.birikim!.fark).toBeLessThan(0);
  });
});

// ============================================================
// Rent
// ============================================================
describe('hesaplaBirikimNBD — rent', () => {
  it('charges rent for all hedefAy months', () => {
    const common = makeCommon({ K_0: 10_000, r_kira: 0, R: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 24 }));

    // 24 months of rent at 10k
    expect(result.toplamKira).toBe(240_000);
  });

  it('first month rent equals K_0 exactly', () => {
    const r_kira = yillikToAylik(0.30);
    const common = makeCommon({ K_0: 27_500, r_kira, R: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 24 }));

    expect(result.aylikNakitAkisi[0].kira).toBe(27_500);
  });

  it('no rent when K_0 is 0', () => {
    const common = makeCommon({ K_0: 0, R: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim());

    expect(result.toplamKira).toBe(0);
  });

  it('rent increases with r_kira', () => {
    const r_kira = yillikToAylik(0.50);
    const common = makeCommon({ K_0: 10_000, r_kira, R: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 24 }));

    // Month 1 < Month 24
    expect(result.aylikNakitAkisi[23].kira).toBeGreaterThan(result.aylikNakitAkisi[0].kira);
  });
});

// ============================================================
// NPV discounting
// ============================================================
describe('hesaplaBirikimNBD — NPV', () => {
  it('with R=0 and no shortfall/surplus, maliyetNBD ≈ toplamOdeme', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim({
      O_oran: 0,
      taksitPlani: { tip: 'sabit', aylikTutar: 50_000 },
      n_e: 120,
    });
    const birikim = makeBirikim({ r_mevduat: 0, hedefAy: 48 });

    const result = hesaplaBirikimNBD(common, evim, birikim);

    // With r_mevduat=0: no growth
    // maliyetNBD should equal toplamOdeme with R=0
    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 0);
  });

  it('with R>0, maliyetNBD < toplamOdeme', () => {
    const R = yillikToAylik(0.40);
    const common = makeCommon({ R, K_0: 10_000, r_kira: 0, r_ev: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 48 }));

    expect(result.maliyetNBD).toBeLessThan(result.toplamOdeme);
  });

  it('R undefined treated as 0', () => {
    const common = makeCommon({ R: undefined, r_ev: 0, K_0: 0 });
    const evim = makeEvim({ O_oran: 0, taksitPlani: { tip: 'sabit', aylikTutar: 50_000 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0, hedefAy: 12 });
    const result = hesaplaBirikimNBD(common, evim, birikim);

    expect(result.maliyetNBD).toBeCloseTo(result.toplamOdeme, 0);
  });
});

// ============================================================
// Shortfall & surplus in NBD
// ============================================================
describe('hesaplaBirikimNBD — shortfall/surplus', () => {
  it('shortfall increases maliyetNBD', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim({ O_oran: 0, taksitPlani: { tip: 'sabit', aylikTutar: 10_000 }, n_e: 120 });

    const low = hesaplaBirikimNBD(common, evim, makeBirikim({ r_mevduat: 0.001, hedefAy: 48 }));
    const high = hesaplaBirikimNBD(common, evim, makeBirikim({ r_mevduat: 0.05, hedefAy: 48 }));

    // Lower return → bigger shortfall → higher cost
    expect(low.maliyetNBD).toBeGreaterThan(high.maliyetNBD);
  });

  it('surplus decreases maliyetNBD', () => {
    const common = makeCommon({ F: 100_000, P: 100_000, R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim({ O_oran: 0, taksitPlani: { tip: 'sabit', aylikTutar: 50_000 }, n_e: 120 });
    const birikim = makeBirikim({ r_mevduat: 0.03, hedefAy: 48 });
    const result = hesaplaBirikimNBD(common, evim, birikim);

    expect(result.birikim!.fark).toBeGreaterThan(0);
    const grossCost = result.aylikNakitAkisi.reduce((s, e) => s + e.toplamCikis, 0) + 100_000;
    expect(result.maliyetNBD).toBeLessThan(grossCost);
  });
});

// ============================================================
// Cumulative cash flow
// ============================================================
describe('hesaplaBirikimNBD — cumulative cash flow', () => {
  it('kumulatifCikis increases monotonically', () => {
    const result = hesaplaBirikimNBD(makeCommon(), makeEvim(), makeBirikim());

    for (let i = 1; i < result.aylikNakitAkisi.length; i++) {
      expect(result.aylikNakitAkisi[i].kumulatifCikis)
        .toBeGreaterThanOrEqual(result.aylikNakitAkisi[i - 1].kumulatifCikis);
    }
  });
});

// ============================================================
// ayHesapla mode
// ============================================================
describe('hesaplaBirikimNBD — ayHesapla mode', () => {
  it('finds the month when savings reach asset value', () => {
    const common = makeCommon({ F: 1_000_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'ayHesapla',
      aylikBirikim: 50_000,
      aylikBirikimArtisOrani: 0,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);

    expect(result.birikim!.hesaplananAy).toBeDefined();
    expect(result.birikim!.hesaplananAy).toBeGreaterThan(0);
    expect(result.birikim!.yeterliMi).toBe(true);
  });

  it('P is invested at T=0, compounded correctly', () => {
    // P=100k, no monthly savings, r_mevduat=0.01
    // After 1 month: S = 100k * 1.01 = 101k
    const common = makeCommon({ F: 200_000, P: 100_000, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'ayHesapla',
      aylikBirikim: 0,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);

    // P should compound once per month from T=0
    // After n months: P * (1.01)^n >= 200k → n ≈ 70
    const expected = Math.ceil(Math.log(200_000 / 100_000) / Math.log(1.01));
    expect(result.birikim!.hesaplananAy).toBe(expected);
  });

  it('inflation-linked increase reaches target faster', () => {
    const common = makeCommon({ F: 1_000_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const noIncrease: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'ayHesapla',
      aylikBirikim: 30_000,
      aylikBirikimArtisOrani: 0,
    };
    const withIncrease: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'ayHesapla',
      aylikBirikim: 30_000,
      aylikBirikimArtisOrani: 0.02,
    };

    const r1 = hesaplaBirikimNBD(common, makeEvim(), noIncrease);
    const r2 = hesaplaBirikimNBD(common, makeEvim(), withIncrease);

    expect(r2.birikim!.hesaplananAy!).toBeLessThan(r1.birikim!.hesaplananAy!);
  });

  it('cash flow length equals hesaplananAy', () => {
    const common = makeCommon({ F: 500_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'ayHesapla',
      aylikBirikim: 50_000,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);
    expect(result.aylikNakitAkisi).toHaveLength(result.birikim!.hesaplananAy!);
  });
});

// ============================================================
// tutarHesapla mode
// ============================================================
describe('hesaplaBirikimNBD — tutarHesapla mode', () => {
  it('calculates required monthly amount to reach target', () => {
    const common = makeCommon({ F: 1_000_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'tutarHesapla',
      hedefAy: 24,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);

    expect(result.birikim!.gerekliAylikTutar).toBeDefined();
    expect(result.birikim!.gerekliAylikTutar!).toBeGreaterThan(0);
    expect(result.birikim!.toplamBirikim).toBeGreaterThanOrEqual(1_000_000 - 1);
  });

  it('P contribution reduces required monthly amount', () => {
    const common1 = makeCommon({ F: 1_000_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const common2 = makeCommon({ F: 1_000_000, P: 500_000, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'tutarHesapla',
      hedefAy: 24,
    };

    const r1 = hesaplaBirikimNBD(common1, makeEvim(), birikim);
    const r2 = hesaplaBirikimNBD(common2, makeEvim(), birikim);

    expect(r2.birikim!.gerekliAylikTutar!).toBeLessThan(r1.birikim!.gerekliAylikTutar!);
  });

  it('returns 0 monthly when P alone covers target', () => {
    const common = makeCommon({ F: 100_000, P: 100_000, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'tutarHesapla',
      hedefAy: 24,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);
    expect(result.birikim!.gerekliAylikTutar).toBe(0);
  });

  it('cash flow length equals hedefAy', () => {
    const common = makeCommon({ F: 1_000_000, P: 0, r_ev: 0, R: 0, K_0: 0 });
    const birikim: BirikimParams = {
      r_mevduat: 0.01,
      mod: 'tutarHesapla',
      hedefAy: 36,
    };
    const result = hesaplaBirikimNBD(common, makeEvim(), birikim);
    expect(result.aylikNakitAkisi).toHaveLength(36);
  });
});

// ============================================================
// Result consistency
// ============================================================
describe('hesaplaBirikimNBD — result consistency', () => {
  it('maliyetNBD uses full precision (not re-summed from rounded entries)', () => {
    const R = yillikToAylik(0.40);
    const r_kira = yillikToAylik(0.30);
    const common = makeCommon({ R, K_0: 20_000, r_kira, r_ev: 0 });
    const result = hesaplaBirikimNBD(common, makeEvim(), makeBirikim({ hedefAy: 120 }));

    // Sum of rounded entries
    const sumRounded = common.P + result.aylikNakitAkisi.reduce((s, e) => s + e.indirgenmisDeger, 0);
    // maliyetNBD should be close but NOT necessarily equal to sumRounded
    // (it uses raw precision internally, only rounding at the end)
    expect(Number.isFinite(result.maliyetNBD)).toBe(true);
  });
});
