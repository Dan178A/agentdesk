/** Pares de tokens del spec §8 que deben cumplir WCAG AA (≥4.5:1 texto normal). */
export interface TokenPair {
  name: string;
  mode: 'light' | 'dark';
  fg: string;
  bg: string;
  min: number;
}

export const TOKENS: TokenPair[] = [
  { name: 'fg sobre bg', mode: 'light', fg: '#1F1E1D', bg: '#FAF9F5', min: 4.5 },
  { name: 'fg sobre bg', mode: 'dark', fg: '#F0EEE6', bg: '#1F1E1D', min: 4.5 },
  { name: 'muted-fg sobre surface', mode: 'light', fg: '#6B6A65', bg: '#FFFFFF', min: 4.5 },
  { name: 'muted-fg sobre surface', mode: 'dark', fg: '#A8A79E', bg: '#262624', min: 4.5 },
  { name: 'primary-fg sobre primary', mode: 'light', fg: '#1F1E1D', bg: '#D97757', min: 4.5 },
  { name: 'primary-fg sobre primary', mode: 'dark', fg: '#1F1E1D', bg: '#D97757', min: 4.5 },
];

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Luminancia relativa W3C de un hex #RRGGBB. */
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Ratio de contraste WCAG entre dos colores #RRGGBB. */
export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = luminance(hexA);
  const l2 = luminance(hexB);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
