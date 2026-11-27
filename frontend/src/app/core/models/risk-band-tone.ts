import type { KnownRiskBand, RiskBand } from './quote.models';

/** Visual tone for a risk band — the single mapping used by the badge and the result panel. */
export type RiskBandTone = 'standard' | 'elevated' | 'high' | 'neutral';

const TONES: Readonly<Record<KnownRiskBand, RiskBandTone>> = {
  STANDARD: 'standard',
  ELEVATED: 'elevated',
  HIGH_RISK: 'high',
};

const isKnownBand = (band: RiskBand): band is KnownRiskBand => Object.hasOwn(TONES, band);

/** Bands a KB adds later (unknown ids) get a neutral tone rather than breaking the UI. */
export const riskBandTone = (band: RiskBand): RiskBandTone => (isKnownBand(band) ? TONES[band] : 'neutral');
