import type {
  CommonParams,
  BankaParams,
  EvimParams,
  BirikimParams,
  KarsilastirmaSonuc,
  ModelAdi,
} from './types';
import { hesaplaBankaNBD } from './banka';
import { hesaplaEvimNBD } from './evim';
import { hesaplaBirikimNBD } from './biriktir';

/**
 * Runs all three models and determines the most cost-effective option.
 *
 * SPEC.md Section 4.1:
 *  - Lowest MaliyetNBD = best option (enKarliModel)
 */
export function karsilastir(
  common: CommonParams,
  banka: BankaParams,
  evim: EvimParams,
  birikim: BirikimParams,
): KarsilastirmaSonuc {
  const bankaResult = hesaplaBankaNBD(common, banka);
  const evimResult = hesaplaEvimNBD(common, evim);
  const biriktirResult = hesaplaBirikimNBD(common, evim, birikim);

  const models: { adi: ModelAdi; nbd: number }[] = [
    { adi: 'banka', nbd: bankaResult.maliyetNBD },
    { adi: 'evim', nbd: evimResult.maliyetNBD },
    { adi: 'biriktir', nbd: biriktirResult.maliyetNBD },
  ];

  models.sort((a, b) => a.nbd - b.nbd);
  const enKarliModel = models[0].adi;

  return {
    banka: bankaResult,
    evim: evimResult,
    biriktir: biriktirResult,
    enKarliModel,
  };
}
