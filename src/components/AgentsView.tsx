import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Bot,
  Check,
  CheckCircle2,
  CircleDashed,
  Copy,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useAgentsStore, LEADER_KEY, SYNTHESIS_KEY, type Agent, type AgentRun } from '../store/agents';
import { useChatStore } from '../store/chat';
import { AgentLogo } from '../assets/AgentLogo';
import { parseModels, DEFAULT_ALIASES, type ModelRaw, type ModelUI } from '../lib/models';
import { ModelPicker } from './ModelPicker';
import { ThinkingPanel } from './ThinkingPanel';
import { runBroadcast, type RunOpts } from '../lib/agents';
import { runOrchestrated } from '../lib/orchestrator';
import type { SkillFile } from '../lib/skills';

/** Vista de agentes: editor de equipo + broadcast/orquestado con grid de resultados. */
export function AgentsView() {
  const teams = useAgentsStore((s) => s.teams);
  const activeTeamId = useAgentsStore((s) => s.activeTeamId);
  const runs = useAgentsStore((s) => s.runs);
  const setRun = useAgentsStore((s) => s.setRun);
  const resetRuns = useAgentsStore((s) => s.resetRuns);
  const loadTeams = useAgentsStore((s) => s.loadTeams);
  const newTeam = useAgentsStore((s) => s.newTeam);
  const setActiveTeam = useAgentsStore((s) => s.setActiveTeam);

  const [models, setModelsUi] = useState<ModelUI[]>([]);
  const [mode, setMode] = useState<'manual' | 'orchestrated'>('manual');
  const [task, setTask] = useState('');
  const [running, setRunning] = useState(false);

  const team = teams.find((t) => t.id === activeTeamId);

  useEffect(() => {
    void loadTeams();
    void loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadModels = async () => {
    try {
      const raw = await invoke<ModelRaw[]>('list_models', {
        ollamaUrl: useChatStore.getState().ollamaUrl,
      });
      setModelsUi(parseModels(raw, DEFAULT_ALIASES));
      useChatStore.getState().setModels(parseModels(raw, DEFAULT_ALIASES));
    } catch {
      // el banner lo maneja ChatView al volver
    }
  };

  if (!team) {
    return (
      <div className="flex h-screen flex-1 items-center justify-center bg-bg text-muted-fg">
        <button
          type="button"
          onClick={() => newTeam('Equipo 1')}
          className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Crear equipo de agentes
        </button>
      </div>
    );
  }

  const runOpts = (): RunOpts => {
    const catalog = useChatStore.getState().skillCatalog;
    const knownSkills = new Set(catalog.filter((c) => c.dir).map((c) => c.dir));
    return {
      ollamaUrl: useChatStore.getState().ollamaUrl,
      canThink: (modelId) => {
        const m = models.find((x) => x.id === modelId);
        return m ? m.canThink : true;
      },
      resolveSkill: async (dir) => {
        if (!knownSkills.has(dir)) return undefined;
        try {
          const file = await invoke<SkillFile>('read_skill', { dir });
          return file.content;
        } catch {
          return undefined;
        }
      },
      onUpdate: (key, patch) => setRun(key, patch),
    };
  };

  const start = async () => {
    const value = task.trim();
    if (!value || running || team.agents.length === 0) return;
    setRunning(true);
    setTask('');
    resetRuns([...team.agents.map((a) => a.id), LEADER_KEY, SYNTHESIS_KEY]);
    team.agents.forEach((a) => setRun(a.id, { status: 'pending' }));
    try {
      if (mode === 'manual') {
        await runBroadcast(team, value, runOpts());
      } else {
        await runOrchestrated(team, value, runOpts());
      }
    } finally {
      setRunning(false);
    }
  };

  const leaderRun = runs[LEADER_KEY];
  const synthesisRun = runs[SYNTHESIS_KEY];

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col bg-bg text-fg">
      {/* Editor de equipo */}
      <div className="border-b border-border px-6 py-4">
        <div className="mx-auto max-w-5xl space-y-3">
          <div className="flex items-center gap-3">
            <input
              value={team.name}
              onChange={(e) => {
                useAgentsStore.setState((s) => ({
                  teams: s.teams.map((t) =>
                    t.id === team.id ? { ...t, name: e.target.value } : t,
                  ),
                }));
              }}
              aria-label="Nombre del equipo"
              className="w-56 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold hover:border-border focus:border-ring focus:outline-none"
            />
            <span className="text-xs text-muted-fg">líder:</span>
            <ModelPicker
              models={models}
              selected={team.orchestratorModel}
              onSelect={(id) =>
                useAgentsStore.setState((s) => ({
                  teams: s.teams.map((t) =>
                    t.id === team.id ? { ...t, orchestratorModel: id } : t,
                  ),
                }))
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {team.agents.map((agent) => (
              <AgentEditorCard key={agent.id} agent={agent} teamId={team.id} models={models} />
            ))}
            <button
              type="button"
              onClick={() => useAgentsStore.getState().addAgent(team.id)}
              className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
            >
              <Plus size={16} aria-hidden />
              Añadir agente
            </button>
          </div>

          {teams.length > 1 && (
            <div className="flex gap-1.5">
              {teams.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTeam(t.id)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors duration-200 ${
                    t.id === team.id ? 'bg-primary text-primary-fg' : 'bg-muted text-muted-fg hover:text-fg'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Input de tarea */}
      <div className="border-b border-border bg-surface px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-end gap-2">
          <div className="flex rounded-lg border border-border bg-surface p-0.5 text-sm">
            {(['manual', 'orchestrated'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 transition-colors duration-200 ${
                  mode === m ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg'
                }`}
                aria-pressed={mode === m}
              >
                {m === 'manual' ? 'Manual (todos)' : 'Orquestado'}
              </button>
            ))}
          </div>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void start();
              }
            }}
            rows={1}
            placeholder={
              mode === 'manual'
                ? 'Mensaje para todos los agentes…'
                : 'Describe la meta; el líder la dividirá en subtareas…'
            }
            aria-label="Tarea para el equipo"
            className="max-h-40 min-h-9 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-[15px] outline-none transition-colors duration-200 placeholder:text-muted-fg focus:border-ring"
          />
          <button
            type="button"
            onClick={() => void start()}
            disabled={!task.trim() || running || team.agents.length === 0}
            aria-label={mode === 'manual' ? 'Enviar a todos' : 'Orquestar meta'}
            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg transition-colors duration-200 hover:opacity-90 disabled:opacity-40"
          >
            {running ? (
              <Loader2 size={15} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={15} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Resultados */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-5xl space-y-3">
          {!running && !leaderRun && !synthesisRun && !team.agents.some((a) => runs[a.id]) && (
            <div className="flex flex-col items-center gap-4 pt-20 text-center">
              <AgentLogo size={72} className="opacity-80" />
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {team.agents.length === 0 ? 'Arma tu equipo de agentes' : 'Tu equipo está listo'}
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-muted-fg">
                  {team.agents.length === 0
                    ? 'Añade agentes arriba: cada uno con su modelo, skill y rol. Al enviar la meta, todos responden en paralelo — o el líder reparte subtareas y sintetiza un resultado.'
                    : 'Envía una meta abajo. En modo manual todos responden en paralelo; en orquestado, el líder divide la meta en subtareas y redacta la síntesis final.'}
                </p>
              </div>
            </div>
          )}
          {leaderRun && (
            <RunCard
              title={`Líder (${team.orchestratorModel})`}
              run={leaderRun}
              highlight
            />
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {team.agents.map((agent) => (
              <RunCard
                key={agent.id}
                title={runs[agent.id]?.subtask ? `${agent.name} · ${runs[agent.id]!.subtask}` : agent.name}
                subtitle={agent.model}
                run={runs[agent.id]}
              />
            ))}
          </div>
          {synthesisRun && <RunCard title="Síntesis" run={synthesisRun} highlight />}
        </div>
      </div>
    </div>
  );
}

/** Tarjeta del editor de agente. */
function AgentEditorCard({
  agent,
  teamId,
  models,
}: {
  agent: Agent;
  teamId: string;
  models: ModelUI[];
}) {
  const updateAgent = useAgentsStore((s) => s.updateAgent);
  const removeAgent = useAgentsStore((s) => s.removeAgent);
  const catalog = useChatStore((s) => s.skillCatalog);
  const skills = catalog.filter((c) => c.dir);

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <Bot size={15} className="shrink-0 text-primary" aria-hidden />
        <input
          value={agent.name}
          onChange={(e) => updateAgent(teamId, agent.id, { name: e.target.value })}
          aria-label={`Nombre del agente ${agent.name}`}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium hover:border-border focus:border-ring focus:outline-none"
        />
        <button
          type="button"
          onClick={() => removeAgent(teamId, agent.id)}
          aria-label={`Eliminar agente ${agent.name}`}
          className="rounded p-1 text-muted-fg transition-colors duration-200 hover:text-error"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ModelPicker
          models={models}
          selected={agent.model}
          onSelect={(id) => updateAgent(teamId, agent.id, { model: id })}
        />
        <select
          value={agent.skill ?? ''}
          onChange={(e) =>
            updateAgent(teamId, agent.id, { skill: e.target.value || undefined })
          }
          aria-label={`Skill del agente ${agent.name}`}
          className="flex-1 rounded-lg border border-border bg-surface px-2 py-1 text-sm text-muted-fg outline-none focus:border-ring"
        >
          <option value="">Sin skill</option>
          {skills.map((s) => (
            <option key={s.dir} value={s.dir}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={agent.rolePrompt}
        onChange={(e) => updateAgent(teamId, agent.id, { rolePrompt: e.target.value })}
        rows={2}
        placeholder="Rol: p. ej. «Analistas requisitos y escribe un resumen»"
        aria-label={`Rol del agente ${agent.name}`}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none transition-colors duration-200 placeholder:text-muted-fg focus:border-ring"
      />
    </div>
  );
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  idle: null,
  pending: <CircleDashed size={13} aria-hidden className="text-muted-fg" />,
  generating: <Loader2 size={13} aria-hidden className="animate-spin text-primary" />,
  done: <CheckCircle2 size={13} aria-hidden className="text-primary" />,
  error: <XCircle size={13} aria-hidden className="text-error" />,
  stopped: <X size={13} aria-hidden className="text-muted-fg" />,
};

/** Tarjeta de resultado de un agente (o líder/síntesis). */
function RunCard({
  title,
  subtitle,
  run,
  highlight,
}: {
  title: string;
  subtitle?: string;
  run?: AgentRun;
  highlight?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  if (!run) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(run.content ?? '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard bloqueado
    }
  };

  return (
    <div
      className={`rounded-xl border p-3 ${
        highlight ? 'border-primary bg-primary/5' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center gap-2">
        {STATUS_ICON[run.status] ?? null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {subtitle && <span className="shrink-0 text-xs text-muted-fg">{subtitle}</span>}
        {run.status === 'done' && run.content && (
          <button
            type="button"
            onClick={copy}
            aria-label="Copiar respuesta"
            className="rounded p-1 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
          >
            {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          </button>
        )}
      </div>
      <ThinkingPanel
        thinking={run.thinking}
        thinkingMs={run.thinkingMs}
        isGenerating={run.status === 'generating' && !!run.thinking}
      />
      {(run.content || run.status === 'generating') && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{run.content}</p>
      )}
      {run.error && (
        <p role="alert" className="mt-1 text-sm text-error">
          {run.error}
        </p>
      )}
    </div>
  );
}
