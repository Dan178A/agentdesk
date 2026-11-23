import '../test/mock-ipc';
import { describe, expect, it } from 'vitest';
import { parseFactsReply, recallFacts, buildFactsSystem, dedupeFacts, FACTS_MAX, type SavedFact } from './facts';

function fact(text: string, ts = 1): SavedFact {
  return { id: `f-${ts}`, text, ts, scope: 'general', chatId: 'c1' };
}

describe('parseFactsReply', () => {
  it('JSON limpio → hasta 3 hechos', () => {
    expect(parseFactsReply('["DropAudio vende audífonos KZ vía Mercado Libre","Viola: CTO de Violin Brain"]')).toEqual([
      'DropAudio vende audífonos KZ vía Mercado Libre',
      'Viola: CTO de Violin Brain',
    ]);
  });

  it('fence json con ruido alrededor', () => {
    const raw = 'Datos clave:\n```json\n["Hecho uno bastante largo para el filtro"]\n```\nlisto';
    expect(parseFactsReply(raw)).toEqual(['Hecho uno bastante largo para el filtro']);
  });

  it('objeto balanceado sin fence', () => {
    expect(parseFactsReply('["hecho con mas de diez caracteres", "no corta el parseo"]')).toHaveLength(2);
  });

  it('descarta cortos (>1 línea y <10 chars) y no-revista', () => {
    expect(parseFactsReply('["corto", 42, {"x":1}]')).toEqual([]);
  });

  it('corrupto → []', () => {
    expect(parseFactsReply('no json aqui')).toEqual([]);
  });
});

describe('recallFacts', () => {
  const facts = [
    fact('DropAudio CCS: tienda de audífonos KZ, precios en Mercado Libre', 1),
    fact('Mercatech: SaaS para vendedores de Mercado Libre', 2),
    fact('Portafolio: landing dorado/negro con motion', 3),
  ];

  it('ordena por coincidencia y limita', () => {
    const out = recallFacts(facts, 'hablemos de la tienda dropaudio');
    expect(out[0].text).toContain('DropAudio');
    expect(out).toHaveLength(1);
    const out2 = recallFacts(facts, 'mercadolibre mercatech dropaudio');
    expect(out2.length).toBe(2);
  });

  it('sin coincidencia → vacío', () => {
    expect(recallFacts(facts, 'cocina molecular')).toEqual([]);
    expect(buildFactsSystem(recallFacts(facts, 'cocina molecular'))).toBe('');
  });

  it('buildFactsSystem con matches listados', () => {
    const sys = buildFactsSystem(recallFacts(facts, 'dropaudio'));
    expect(sys).toContain('Memoria guardada');
    expect(sys).toContain('- DropAudio CCS:');
  });
});

describe('dedupeFacts', () => {
  it('agrega sin duplicados y respeta FACTS_MAX', () => {
    let facts: SavedFact[] = [fact('DropAudio vende KZ', 1)];
    facts = dedupeFacts(facts, ['DropAudio vende KZ', 'Viola es CTO de Violin Brain'], 'general', 'c2');
    expect(facts.length).toBe(2);
    facts = dedupeFacts(facts, Array.from({ length: FACTS_MAX + 10 }, (_, i) => `hecho numero ${i} que es suficientemente largo`), 'general', 'c2');
    expect(facts.length).toBe(FACTS_MAX);
    expect(facts.some((f) => f.text === 'Viola es CTO de Violin Brain')).toBe(false); // quedó fuera por antigüedad
  });
});
