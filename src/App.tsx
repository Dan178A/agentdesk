import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { parseModels, DEFAULT_ALIASES, type ModelRaw, type ModelUI } from './lib/models';

const OLLAMA_URL = 'http://localhost:11434';

export default function App() {
  const [models, setModels] = useState<ModelUI[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const raw = await invoke<ModelRaw[]>('list_models', { ollamaUrl: OLLAMA_URL });
      setModels(parseModels(raw, DEFAULT_ALIASES));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <main style={{ padding: '2rem' }}>
        <p role="alert">Ollama no responde en {OLLAMA_URL} — arráncalo con «ollama serve»</p>
        <button onClick={() => void load()}>Reintentar</button>
      </main>
    );
  }

  if (!models) {
    return <main style={{ padding: '2rem' }}>Cargando modelos…</main>;
  }

  return (
    <main style={{ padding: '2rem' }}>
      <ul>
        {models.map((m) => (
          <li key={m.id}>{m.alias ?? m.id}</li>
        ))}
      </ul>
    </main>
  );
}
