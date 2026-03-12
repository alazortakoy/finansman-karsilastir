import type { CommonParams, EvimParams, ModelSonuc } from './types';
import { hesaplaEvimNBD } from './evim';

export interface CekilisliSonuc {
  enIyi: ModelSonuc;
  beklenen: ModelSonuc;
  enKotu: ModelSonuc;
  ozel?: ModelSonuc;
}

/**
 * Calculates Evim NBD for three lottery-draw scenarios.
 *
 * SPEC.md Section 3.5:
 *  - enIyi:    t_teslim = 1 (first month draw)
 *  - beklenen: t_teslim = Math.round(grupBuyuklugu / 2)
 *  - enKotu:   t_teslim = grupBuyuklugu (last to draw)
 *  - ozel:     optional user-specified month
 *
 * Each scenario runs the full Evim NBD calculation with its own t_teslim.
 */
export function hesaplaCekilisliSenaryolar(
  common: CommonParams,
  evim: EvimParams,
  grupBuyuklugu: number,
  ozelAy?: number,
): CekilisliSonuc {
  const enIyi = hesaplaEvimNBD(common, { ...evim, t_teslim: 1 });
  const beklenen = hesaplaEvimNBD(common, {
    ...evim,
    t_teslim: Math.round(grupBuyuklugu / 2),
  });
  const enKotu = hesaplaEvimNBD(common, {
    ...evim,
    t_teslim: grupBuyuklugu,
  });

  const result: CekilisliSonuc = { enIyi, beklenen, enKotu };

  if (ozelAy !== undefined) {
    result.ozel = hesaplaEvimNBD(common, { ...evim, t_teslim: ozelAy });
  }

  return result;
}
