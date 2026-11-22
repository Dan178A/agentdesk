import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildCatalog, BUILTIN_CMDS, type SkillRaw } from './skills';

function raw(dir: string, content: string): SkillRaw {
  return { dir, content };
}

describe('parseFrontmatter (Review Focus 3)', () => {
  it('frontmatter simple: name y description en una línea', () => {
    const result = parseFrontmatter(
      raw('mi-skill', '---\nname: mi-skill\ndescription: Hace cosas útiles\n---\n\n# Contenido'),
    );
    expect(result).toEqual({ dir: 'mi-skill', name: 'mi-skill', description: 'Hace cosas útiles' });
  });

  it('description multilínea con >- (plegada a espacios)', () => {
    const result = parseFrontmatter(
      raw('multi', '---\nname: multi\ndescription: >-\n  primera línea\n  segunda línea\n---\ncuerpo'),
    );
    expect(result?.description).toBe('primera línea segunda línea');
  });

  it('description entre comillas se limpia', () => {
    const result = parseFrontmatter(
      raw('quotes', '---\nname: quotes\ndescription: "con comillas"\n---\ncuerpo'),
    );
    expect(result?.description).toBe('con comillas');
  });

  it('sin description: name queda y description vacía', () => {
    const result = parseFrontmatter(raw('sin-desc', '---\nname: sin-desc\n---\ncuerpo'));
    expect(result).toEqual({ dir: 'sin-desc', name: 'sin-desc', description: '' });
  });

  it('sin name: el fallback es el dir', () => {
    const result = parseFrontmatter(raw('solo-desc', '---\ndescription: algo\n---\ncuerpo'));
    expect(result?.name).toBe('solo-desc');
  });

  it('sin frontmatter → null', () => {
    expect(parseFrontmatter(raw('nofm', 'Solo texto sin frontmatter'))).toBeNull();
  });

  it('SKILL.md vacío → null', () => {
    expect(parseFrontmatter(raw('vacio', ''))).toBeNull();
  });

  it('content cortado a mitad del frontmatter → null (tolerante)', () => {
    const cortado = '---\nname: cortado\ndescription: >-\n  línea que se corta aq';
    expect(parseFrontmatter(raw('cortado', cortado))).toBeNull();
  });

  it('description con | (literal) también se plega', () => {
    const result = parseFrontmatter(
      raw('literal', '---\nname: literal\ndescription: |\n  línea 1\n  línea 2\n---\ncuerpo'),
    );
    expect(result?.description).toBe('línea 1\nlínea 2');
  });
});

describe('buildCatalog', () => {
  const metas = [
    { dir: 'zeta', name: 'zeta', description: 'último' },
    { dir: 'beta', name: 'beta', description: 'diseño ui' },
  ];

  it('built-ins primero, skills alfabéticos después', () => {
    const items = buildCatalog(metas);
    expect(items.slice(0, BUILTIN_CMDS.length).map((i) => i.name)).toEqual(
      BUILTIN_CMDS.map((b) => b.name),
    );
    expect(items.slice(BUILTIN_CMDS.length).map((i) => i.name)).toEqual(['beta', 'zeta']);
  });

  it('colisión de nombre: el built-in gana (spec §7.2.5)', () => {
    const colision = [...metas, { dir: 'model-x', name: 'model', description: 'skill llamado model' }];
    const items = buildCatalog(colision);
    const models = items.filter((i) => i.name === 'model');
    expect(models.length).toBe(1);
    expect(models[0].builtin).toBe(true);
  });

  it('skill invalido no entra al catálogo', () => {
    const items = buildCatalog(metas, [raw('invalido', 'sin frontmatter')]);
    expect(items.find((i) => i.name === 'invalido')).toBeUndefined();
  });
});
