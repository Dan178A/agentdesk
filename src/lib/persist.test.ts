import { describe, it, expect } from 'vitest';
import { hydrateHistory, serializeChats, hydrateSettings, DEFAULT_SETTINGS } from './persist';

const CHAT1 = {
  id: 'a',
  title: 'Chat uno',
  model: 'glm-5.3-flash:cloud',
  projectId: 'general',
  messages: [{ role: 'user' as const, content: 'hola', createdAt: 1 }],
  createdAt: 1,
  updatedAt: 1,
};

describe('hydrateHistory', () => {
  it('JSON válido con 2 chats → 2 chats', () => {
    const raw = JSON.stringify([CHAT1, { ...CHAT1, id: 'b' }]);
    expect(hydrateHistory(raw).length).toBe(2);
    expect(hydrateHistory(raw)[0].id).toBe('a');
  });

  it('JSON corrupto → []', () => {
    expect(hydrateHistory('{corrupto')).toEqual([]);
  });

  it('null → []', () => {
    expect(hydrateHistory(null)).toEqual([]);
  });

  it('no-array (objeto suelto) → []', () => {
    expect(hydrateHistory('{"id":"x"}')).toEqual([]);
  });

  it('elementos sin id o messages se filtran', () => {
    const raw = JSON.stringify([CHAT1, { title: 'sin id' }, { id: 'sin-messages' }]);
    expect(hydrateHistory(raw).length).toBe(1);
  });

  it('serializeChats hace round-trip', () => {
    const chats = [CHAT1];
    expect(hydrateHistory(serializeChats(chats))[0].title).toBe('Chat uno');
  });
});

describe('hydrateSettings', () => {
  it('null → defaults', () => {
    const s = hydrateSettings(null);
    expect(s.aliases).toEqual(DEFAULT_SETTINGS.aliases);
    expect(s.ollamaUrl).toBe('http://localhost:11434');
  });

  it('parcial → merge con defaults', () => {
    const s = hydrateSettings(JSON.stringify({ defaultModel: 'glm-5.3:cloud' }));
    expect(s.defaultModel).toBe('glm-5.3:cloud');
    expect(s.ollamaUrl).toBe('http://localhost:11434'); // default conservado
  });

  it('corrupto → defaults', () => {
    expect(hydrateSettings('no json')['theme']).toBe('system');
  });
});
