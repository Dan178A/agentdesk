import { describe, it, expect } from 'vitest';
import { contrastRatio, TOKENS } from './contrast';

describe('contraste WCAG de los tokens del spec §8', () => {
  it.each(TOKENS)('$name ($mode) ≥ $min', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
