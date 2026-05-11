import type { MagasinData } from '@/types';

export type SpiralLevel = 'none' | 'watch' | 'risk' | 'critical';

export function detectSpiral(data: MagasinData): SpiralLevel {
  const stockAge = data.stockAge || 0;
  if (stockAge === 0 && data.tauxMargeNette === 0) return 'none';

  // tresoRatio proxy: tauxMargeNette normalized to 38% target
  // 1.0 = on target, < 1 = margin pressure
  const tresoRatio = data.tauxMargeNette > 0
    ? data.tauxMargeNette / 38
    : (stockAge > 0 ? 0.6 : 0);

  if (stockAge > 40 && tresoRatio < 0.5) return 'critical';
  if (stockAge > 30 && tresoRatio < 0.8) return 'risk';
  if (stockAge > 25 || (tresoRatio > 0 && tresoRatio < 1.0)) return 'watch';
  return 'none';
}

export const SPIRAL_LABEL: Record<SpiralLevel, string> = {
  none: '',
  watch: 'Vigilance stock',
  risk: 'Risque spirale',
  critical: 'SPIRALE DÉTECTÉE',
};
