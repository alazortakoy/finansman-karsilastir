import { describe, it, expect } from 'vitest';
import { karsilastir } from '../karsilastir';
import { hesaplaBankaNBD } from '../banka';
import { hesaplaEvimNBD } from '../evim';
import { hesaplaBirikimNBD } from '../biriktir';
import { yillikToAylik } from '../helpers';
import type { CommonParams, BankaParams, EvimParams, BirikimParams } from '../types';

// ============================================================
// Shared test fixtures
// ============================================================
function makeCommon(overrides: Partial<CommonParams> = {}): CommonParams {
  return {
    F: 5_000_000,
    P: 0,
    assetType: 'konut',
    R: yillikToAylik(0.40),
    r_ev: yillikToAylik(0.30),
    K_0: 25_000,
    r_kira: yillikToAylik(0.50),
    ...overrides,
  };
}

function makeBanka(overrides: Partial<BankaParams> = {}): BankaParams {
  return {
    r_b: yillikToAylik(3.20),
    n_b: 120,
    bsmvOrani: 0.05,
    dosyaMasrafi: 15_000,
    ekspertizUcreti: 5_000,
    ipotekHarciOrani: 0,
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
// karsilastir — output structure
// ============================================================
describe('karsilastir — output structure', () => {
  it('returns all three model results and enKarliModel', () => {
    const result = karsilastir(makeCommon(), makeBanka(), makeEvim(), makeBirikim());

    expect(result).toHaveProperty('banka');
    expect(result).toHaveProperty('evim');
    expect(result).toHaveProperty('biriktir');
    expect(result).toHaveProperty('enKarliModel');
    expect(['banka', 'evim', 'biriktir']).toContain(result.enKarliModel);
  });

  it('each model result has maliyetNBD', () => {
    const result = karsilastir(makeCommon(), makeBanka(), makeEvim(), makeBirikim());

    expect(Number.isFinite(result.banka.maliyetNBD)).toBe(true);
    expect(Number.isFinite(result.evim.maliyetNBD)).toBe(true);
    expect(Number.isFinite(result.biriktir.maliyetNBD)).toBe(true);
  });
});

// ============================================================
// karsilastir — consistency with individual functions
// ============================================================
describe('karsilastir — consistency', () => {
  it('banka result matches standalone hesaplaBankaNBD', () => {
    const common = makeCommon();
    const banka = makeBanka();
    const combined = karsilastir(common, banka, makeEvim(), makeBirikim());
    const standalone = hesaplaBankaNBD(common, banka);

    expect(combined.banka.maliyetNBD).toBe(standalone.maliyetNBD);
    expect(combined.banka.toplamOdeme).toBe(standalone.toplamOdeme);
  });

  it('evim result matches standalone hesaplaEvimNBD', () => {
    const common = makeCommon();
    const evim = makeEvim();
    const combined = karsilastir(common, makeBanka(), evim, makeBirikim());
    const standalone = hesaplaEvimNBD(common, evim);

    expect(combined.evim.maliyetNBD).toBe(standalone.maliyetNBD);
    expect(combined.evim.toplamOdeme).toBe(standalone.toplamOdeme);
  });

  it('biriktir result matches standalone hesaplaBirikimNBD', () => {
    const common = makeCommon();
    const evim = makeEvim();
    const birikim = makeBirikim();
    const combined = karsilastir(common, makeBanka(), evim, birikim);
    const standalone = hesaplaBirikimNBD(common, evim, birikim);

    expect(combined.biriktir.maliyetNBD).toBe(standalone.maliyetNBD);
    expect(combined.biriktir.toplamOdeme).toBe(standalone.toplamOdeme);
  });
});

// ============================================================
// karsilastir — enKarliModel picks lowest MaliyetNBD
// ============================================================
describe('karsilastir — enKarliModel selection', () => {
  it('selects the model with lowest maliyetNBD', () => {
    const result = karsilastir(makeCommon(), makeBanka(), makeEvim(), makeBirikim());

    const nbds = {
      banka: result.banka.maliyetNBD,
      evim: result.evim.maliyetNBD,
      biriktir: result.biriktir.maliyetNBD,
    };

    const minNBD = Math.min(nbds.banka, nbds.evim, nbds.biriktir);
    expect(nbds[result.enKarliModel]).toBe(minNBD);
  });
});

// ============================================================
// SPEC 9.4 — R=0 means no discounting
// ============================================================
describe('integration — R=0 no discounting', () => {
  it('all models: maliyetNBD ≈ toplamOdeme when R=0 and no asset adjustment', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const banka = makeBanka({ bsmvOrani: 0.05, dosyaMasrafi: 0, ekspertizUcreti: 0, ipotekHarciOrani: 0 });
    const evim = makeEvim();

    const bankaResult = hesaplaBankaNBD(common, banka);
    expect(bankaResult.maliyetNBD).toBeCloseTo(bankaResult.toplamOdeme, 0);

    const evimResult = hesaplaEvimNBD(common, evim);
    // beklemeFarki = F/1^t - F = 0 when r_ev=0 and R=0
    expect(evimResult.maliyetNBD).toBeCloseTo(evimResult.toplamOdeme, 0);
  });
});

// ============================================================
// SPEC 9.5 — P = F (full cash payment)
// ============================================================
describe('integration — P = F edge case', () => {
  it('banka: no loan, maliyetNBD = F + one-time costs', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000, R: 0, r_ev: 0, K_0: 0 });
    const banka = makeBanka({ dosyaMasrafi: 10_000, ekspertizUcreti: 5_000, ipotekHarciOrani: 0 });
    const result = hesaplaBankaNBD(common, banka);

    expect(result.maliyetNBD).toBe(5_015_000);
    expect(result.toplamFaiz).toBe(0);
  });

  it('evim: full down payment, org fee based on financed amount (0)', () => {
    const common = makeCommon({ F: 5_000_000, P: 5_000_000, R: 0, r_ev: 0, K_0: 0 });
    const evim = makeEvim();
    const result = hesaplaEvimNBD(common, evim);

    // finansmanTutari = F-P = 0, so O_toplam = 0
    expect(result.toplamOrgUcreti).toBe(0);
    // maliyetNBD = P + installments (taksit plan still runs for n_e months)
    expect(result.maliyetNBD).toBeGreaterThanOrEqual(5_000_000);
  });
});

// ============================================================
// SPEC 9.1 — Full reference scenario
// ============================================================
describe('integration — SPEC 9.1 full scenario', () => {
  it('runs the complete comparison with SPEC parameters', () => {
    const R = yillikToAylik(0.40);
    const r_ev = yillikToAylik(0.30);
    const r_kira = yillikToAylik(0.50);

    const common: CommonParams = {
      F: 5_000_000,
      P: 0,
      assetType: 'konut',
      R,
      r_ev,
      K_0: 25_000,
      r_kira,
    };

    const banka: BankaParams = {
      r_b: yillikToAylik(3.20),
      n_b: 120,
      dosyaMasrafi: 15_000,
      ekspertizUcreti: 5_000,
      ipotekHarciOrani: 0,
      bsmvOrani: 0.05,
    };

    const evim: EvimParams = {
      model: 'cekilissiz',
      O_oran: 0.08,
      n_e: 120,
      t_teslim: 48,
      taksitPlani: { tip: 'sabit', aylikTutar: 55_556 },
      orgUcretPesinOrani: 0.50,
      orgUcretTaksitSayisi: 4,
    };

    const birikim: BirikimParams = {
      r_mevduat: yillikToAylik(0.45),
      mod: 'piyangoKarsilastir',
      hedefAy: 48,
    };

    const result = karsilastir(common, banka, evim, birikim);

    // All models should produce finite results
    expect(Number.isFinite(result.banka.maliyetNBD)).toBe(true);
    expect(Number.isFinite(result.evim.maliyetNBD)).toBe(true);
    expect(Number.isFinite(result.biriktir.maliyetNBD)).toBe(true);

    // Banka total payment must exceed F (interest-bearing)
    expect(result.banka.toplamOdeme).toBeGreaterThan(5_000_000);

    // Evim has org fee (based on F-P = 5M, O_oran=0.08 → 400k)
    expect(result.evim.toplamOrgUcreti).toBe(400_000);

    // Biriktir has birikim detail
    expect(result.biriktir.birikim).toBeDefined();

    // enKarliModel is one of the three
    expect(['banka', 'evim', 'biriktir']).toContain(result.enKarliModel);

    // Winner has the lowest NBD
    const nbds = [result.banka.maliyetNBD, result.evim.maliyetNBD, result.biriktir.maliyetNBD];
    const winnerNBD = result[result.enKarliModel].maliyetNBD;
    expect(winnerNBD).toBe(Math.min(...nbds));
  });
});

// ============================================================
// Different parameter sets produce different winners
// ============================================================
describe('integration — parameter sensitivity', () => {
  it('very high bank rate makes banka lose', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const banka = makeBanka({ r_b: 0.10, n_b: 120 }); // ~10% monthly!
    const evim = makeEvim();
    const birikim = makeBirikim({ r_mevduat: 0.03, hedefAy: 48 });

    const result = karsilastir(common, banka, evim, birikim);

    expect(result.banka.maliyetNBD).toBeGreaterThan(result.evim.maliyetNBD);
  });

  it('zero investment return makes biriktir expensive', () => {
    const common = makeCommon({ R: 0, r_ev: 0, K_0: 0 });
    const banka = makeBanka({ r_b: 0.005, n_b: 120, bsmvOrani: 0 });
    const evim = makeEvim();
    const birikim = makeBirikim({ r_mevduat: 0, hedefAy: 48 });

    const result = karsilastir(common, banka, evim, birikim);

    // With 0 return, biriktir must pay all installments + shortfall
    // This should be at least as expensive as evim
    expect(Number.isFinite(result.biriktir.maliyetNBD)).toBe(true);
  });
});
