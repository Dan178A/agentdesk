import { describe, it, expect } from 'vitest';
import { resolveTheme, applyTheme } from './theme';

describe('resolveTheme', () => {
  it('system + prefersDark → dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });
  it('system + sin prefersDark → light', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });
  it('dark explícito gana sobre el sistema', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('light explícito gana sobre el sistema', () => {
    expect(resolveTheme('light', true)).toBe('light');
  });
});

describe('applyTheme', () => {
  it('setea data-theme en el documentElement', () => {
    const dataset: Record<string, string> = {};
    const stub = { documentElement: { dataset } };
    applyTheme('dark', stub as unknown as Document);
    expect(dataset.theme).toBe('dark');
  });
  it('cambia el tema de dark a light', () => {
    const dataset: Record<string, string> = { theme: 'dark' };
    const stub = { documentElement: { dataset } };
    applyTheme('light', stub as unknown as Document);
    expect(dataset.theme).toBe('light');
  });
});
