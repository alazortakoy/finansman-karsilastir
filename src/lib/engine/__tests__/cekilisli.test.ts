import { describe, it, expect } from 'vitest';
import { hesaplaCekilisliSenaryolar } from '../cekilisli';
import { hesaplaEvimNBD } from '../evim';
import { yillikToAylik } from '../helpers';
import type { CommonParams, EvimParams } from '../types';

// ============================================================
// Helpers
// ============================================================
function makeCommon(overrides: Partial<CommonParams> = {}): CommonParams {
  return {
    F: 5_000_000,
    P: 0,
    assetType: 'konut',
    K_0: 20_000,
    r_kira: yillikToAylik(0.50),
    R: yillikToAylik(0.40),
    ...overrides,
  };
}

function makeEvim(overrides: Partial<EvimParams> = {}): EvimParams {
  return {
    model: 'cekilisli',
    O_oran: 0.08,
    n_e: 120,
    t_teslim: 50, // will be overridden by scenarios
    taksitPlani: { tip: 'sabit', aylikTutar: 55_556 },
    orgUcretPesinOrani: 0.50,
    orgUcretTaksitSayisi: 4,
    ...overrides,
  };
}

// ============================================================
// Output structure
// ============================================================
describe('hesaplaCekilisliSenaryolar — output structure', () => {
  it('returns enIyi, beklenen, enKotu', () => {
    const result = hesaplaCekilisliSenaryolar(makeCommon(), makeEvim(), 100);

    expect(result).toHaveProperty('enIyi');
    expect(result).toHaveProperty('beklenen');
    expect(result).toHaveProperty('enKotu');
    expect(result.ozel).toBeUndefined();
  });

  it('includes ozel when ozelAy is provided', () => {
    const result = hesaplaCekilisliSenaryolar(makeCommon(), makeEvim(), 100, 30);

    expect(result.ozel).toBeDefined();
    expect(result.ozel!.aylikNakitAkisi).toHaveLength(120);
  });
});

// ============================================================
// Correct t_teslim for each scenario
// ============================================================
describe('hesaplaCekilisliSenaryolar — t_teslim mapping', () => {
  it('enIyi uses t_teslim=1', () => {
    const common = makeCommon({ R: 0, K_0: 10_000, r_kira: 0, r_ev: 0 });
    const evim = makeEvim();
    const result = hesaplaCekilisliSenaryolar(common, evim, 100);

    // Compare with direct call using t_teslim=1
    const direct = hesaplaEvimNBD(common, { ...evim, t_teslim: 1 });
    expect(result.enIyi.maliyetNBD).toBe(direct.maliyetNBD);
    expect(result.enIyi.toplamKira).toBe(direct.toplamKira);
  });

  it('beklenen uses t_teslim=round(grupBuyuklugu/2)', () => {
    const common = makeCommon({ R: 0, K_0: 10_000, r_kira: 0, r_ev: 0 });
    const evim = makeEvim();
    const result = hesaplaCekilisliSenaryolar(common, evim, 100);

    const direct = hesaplaEvimNBD(common, { ...evim, t_teslim: 50 });
    expect(result.beklenen.maliyetNBD).toBe(direct.maliyetNBD);
  });

  it('enKotu uses t_teslim=grupBuyuklugu', () => {
    const common = makeCommon({ R: 0, K_0: 10_000, r_kira: 0, r_ev: 0 });
    const evim = makeEvim();
    const result = hesaplaCekilisliSenaryolar(common, evim, 100);

    const direct = hesaplaEvimNBD(common, { ...evim, t_teslim: 100 });
    expect(result.enKotu.maliyetNBD).toBe(direct.maliyetNBD);
  });

  it('ozel uses the provided ozelAy', () => {
    const common = makeCommon({ R: 0, K_0: 10_000, r_kira: 0, r_ev: 0 });
    const evim = makeEvim();
    const result = hesaplaCekilisliSenaryolar(common, evim, 100, 25);

    const direct = hesaplaEvimNBD(common, { ...evim, t_teslim: 25 });
    expect(result.ozel!.maliyetNBD).toBe(direct.maliyetNBD);
  });

  it('handles odd grupBuyuklugu (rounding)', () => {
    const result = hesaplaCekilisliSenaryolar(makeCommon(), makeEvim(), 77);
    // round(77/2) = round(38.5) = 39
    // Just verify it runs without error and returns a finite number
    expect(Number.isFinite(result.beklenen.maliyetNBD)).toBe(true);
  });
});

// ============================================================
// Monotonicity: later delivery → higher rent cost
// ============================================================
describe('hesaplaCekilisliSenaryolar — cost ordering', () => {
  it('enIyi has lowest toplamKira, enKotu has highest', () => {
    const common = makeCommon({ K_0: 20_000, r_kira: 0 });
    const result = hesaplaCekilisliSenaryolar(common, makeEvim(), 100);

    expect(result.enIyi.toplamKira!).toBeLessThanOrEqual(result.beklenen.toplamKira!);
    expect(result.beklenen.toplamKira!).toBeLessThanOrEqual(result.enKotu.toplamKira!);
  });

  it('enIyi has 0 toplamKira (t_teslim=1 means no waiting)', () => {
    const common = makeCommon({ K_0: 20_000, r_kira: 0 });
    const result = hesaplaCekilisliSenaryolar(common, makeEvim(), 100);

    expect(result.enIyi.toplamKira).toBe(0);
  });
});

// ============================================================
// Different group sizes
// ============================================================
describe('hesaplaCekilisliSenaryolar — group sizes', () => {
  it('larger group → worse enKotu scenario', () => {
    const common = makeCommon({ K_0: 10_000, r_kira: 0 });
    const evim = makeEvim();

    const small = hesaplaCekilisliSenaryolar(common, evim, 50);
    const large = hesaplaCekilisliSenaryolar(common, evim, 100);

    // Larger group means enKotu has t_teslim=100 vs 50 → more rent
    expect(large.enKotu.toplamKira!).toBeGreaterThan(small.enKotu.toplamKira!);
  });
});
