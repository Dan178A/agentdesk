import { describe, it, expect } from 'vitest';
import { buildFolderSystem, scoreFile, FOLDER_CONTEXT_BUDGET, type FolderRoot } from './folderContext';
import type { FileRead } from './fsFiles';

function file(name: string, content: string): FileRead {
  return { name, extension: '', content, isBinary: false, sizeBytes: content.length };
}

const ROOT: FolderRoot = {
  path: 'C:\\memoria',
  name: 'memoria',
  files: [
    file('proyectos/dropaudio.md', 'Tienda DropAudio de KZ: precios, Mercado Libre, estrategia.'),
    file('proyectos/mercatech.md', 'SaaS para vendedores de Mercado Libre.'),
    file('personal/violin.md', 'Academia online de violín, CTO.'),
    file('datos/notas.txt', 'Lista de compras: pan leche café.'),
  ],
};

describe('scoreFile', () => {
  it('coincidencias en contenido y nombre suman', () => {
    const tokens = ['dropaudio', 'mercadolibre'];
    const hit = scoreFile(ROOT.files[0], tokens);
    expect(hit).toBeGreaterThan(0);
    const other = scoreFile(ROOT.files[2], tokens);
    expect(other).toBe(0);
  });

  it('el nombre pesa más que el contenido', () => {
    const tokens = ['violinfuerte'];
    const byName = file('x/violinfuerte.md', 'nada relevante aquí');
    const byContent = file('x/otro.md', 'menciona violinfuerte una vez');
    expect(scoreFile(byName, tokens)).toBeGreaterThan(scoreFile(byContent, tokens));
  });
});

describe('buildFolderSystem', () => {
  it('incluye índice siempre y solo los archivos que coinciden con la consulta', () => {
    const text = buildFolderSystem([ROOT], 'hablemos de dropaudio y su mercado');
    expect(text).toContain('adjuntó la carpeta «memoria»');
    expect(text).toContain('Índice de memoria');
    expect(text).toContain('- datos/notas.txt');
    expect(text).toContain('— archivo: proyectos/dropaudio.md —');
    expect(text).toContain('KZ');
    expect(text).toContain('proyectos/mercatech.md —'); // 'mercado' también aparece en su contenido
  });

  it('sin coincidencias → índice + instrucción de pedir archivo', () => {
    const text = buildFolderSystem([ROOT], 'receta de brownie');
    expect(text).toContain('Ningún archivo coincide');
    expect(text).not.toContain('— archivo:');
  });

  it('respeta el presupuesto y avisa el recorte', () => {
    const big: FolderRoot = {
      ...ROOT,
      files: [
        file('a/big1.md', 'dropaudio '.repeat(12000)),
        file('a/big2.md', 'dropaudio '.repeat(12000)),
      ],
    };
    const text = buildFolderSystem([big], 'todo sobre dropaudio', 8000);
    expect(text.length).toBeLessThan(FOLDER_CONTEXT_BUDGET);
    expect(text).toContain('no cupieron');
  });

  it('varias carpetas producen un solo system con ambas', () => {
    const otra: FolderRoot = { path: 'C:\\otra', name: 'otra', files: [file('doc.md', 'dropaudio aparece aquí también')] };
    const text = buildFolderSystem([ROOT, otra], 'dropaudio');
    expect(text).toContain('Índice de memoria');
    expect(text).toContain('Índice de otra');
    expect(text).toContain('— archivo: doc.md —');
  });
});
