import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Check,
  ChevronDown,
  FolderInput,
  FolderPlus,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeftClose,
  Pencil,
  Sun,
  Trash2,
  Users,
  X,
  Gauge,
} from 'lucide-react';
import { AgentLogo } from '../assets/AgentLogo';
import { useChatStore } from '../store/chat';
import { useProjectsStore } from '../store/projects';
import { useAgentsStore } from '../store/agents';
import type { Chat } from '../store/chat';

/** Sidebar: proyectos expandibles con sus chats; colapsable global. */
export function Sidebar({ onToggle }: { onToggle: () => void }) {
  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const newChat = useChatStore((s) => s.newChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const setActive = useChatStore((s) => s.setActive);
  const projects = useProjectsStore((s) => s.projects);
  const collapsedProjects = useProjectsStore((s) => s.collapsed);
  const loadProjects = useProjectsStore((s) => s.load);
  const createProject = useProjectsStore((s) => s.create);
  const removeProject = useProjectsStore((s) => s.remove);
  const toggleCollapse = useProjectsStore((s) => s.toggleCollapse);
  const setFolder = useProjectsStore((s) => s.setFolder);
  const openProject = (projectId: string) => {
    // tocar el proyecto lo lleva a su pantalla: chat nuevo en él con sus últimos chats debajo
    const existing = chats.filter((c) => c.projectId === projectId).sort((a, b) => b.updatedAt - a.updatedAt);
    if (existing.length > 0) {
      // reusa un chat vacío del proyecto si lo hay; si no, crea uno nuevo en él
      const empty = existing.find((c) => c.messages.length === 0);
      if (empty) {
        setActive(empty.id);
      } else {
        useChatStore.getState().newChat(existing[0].model);
        useChatStore.setState((s) => ({
          chats: s.chats.map((c) => (c.id === s.activeChatId ? { ...c, projectId } : c)),
        }));
      }
    } else {
      startNewChat(projectId);
    }
    useAgentsStore.getState().setView('chats');
  };

  const pickFolder = async (projectId: string) => {
    try {
      const selected = await open({ directory: true, title: 'Carpeta del proyecto' });
      if (selected) setFolder(projectId, selected);
    } catch {
      // diálogo cancelado
    }
  };
  const view = useAgentsStore((s) => s.view);
  const setView = useAgentsStore((s) => s.setView);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isDark, setIsDark] = useState(
    () => document.documentElement.dataset.theme === 'dark',
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const startNewChat = (projectId: string) => {
    const id = newChat();
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => (c.id === id ? { ...c, projectId } : c)),
    }));
    setActive(id);
  };

  const addProject = () => {
    const name = newProjectName.trim();
    if (name) createProject(name);
    setNewProjectName('');
    setNewProjectOpen(false);
  };

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    setIsDark(next === 'dark');
  };

  return (
    <aside
      aria-label="Barra lateral de proyectos y chats"
      className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <span className="flex items-center gap-2 px-1">
          <AgentLogo size={22} />
          <span className="text-sm font-semibold tracking-tight">AgentDesk</span>
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Esconder barra lateral"
          className="rounded-lg p-1.5 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
        >
          <PanelLeftClose size={16} aria-hidden />
        </button>
      </div>

      {/* Proyectos y chats */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {projects.map((p) => {
          const projectChats = chats.filter((c) => c.projectId === p.id);
          const isCollapsed = collapsedProjects[p.id];
          return (
            <section key={p.id} className="mb-1">
              <div className="group flex items-center gap-1 rounded-lg px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => toggleCollapse(p.id)}
                  aria-expanded={!isCollapsed}
                  aria-label={isCollapsed ? `Expandir ${p.name}` : `Colapsar ${p.name}`}
                  className="rounded p-0.5 text-muted-fg transition-colors duration-150 hover:text-fg"
                >
                  <ChevronDown
                    size={13}
                    aria-hidden
                    className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openProject(p.id)}
                  title={`Abrir ${p.name}${p.folder ? ` — carpeta vinculada: ${p.folder}` : ''}`}
                  className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left text-xs font-medium uppercase tracking-wide text-muted-fg transition-colors duration-200 hover:text-fg"
                >
                  <span className="truncate">{p.name}</span>
                  {p.folder && <FolderInput size={11} aria-hidden className="shrink-0 text-primary" />}
                  <span className="ml-auto text-[10px]">{projectChats.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => startNewChat(p.id)}
                  aria-label={`Nuevo chat en ${p.name}`}
                  className="rounded p-1 text-muted-fg opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-fg group-hover:opacity-100"
                >
                  <MessageSquarePlus size={13} aria-hidden />
                </button>
                {p.id !== 'general' && (
                  <>
                    <button
                      type="button"
                      onClick={() => void pickFolder(p.id)}
                      aria-label={
                        p.folder ? `Cambiar carpeta de ${p.name}` : `Vincular carpeta a ${p.name}`
                      }
                      className={`rounded p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${
                        p.folder ? 'text-primary' : 'text-muted-fg hover:text-fg'
                      }`}
                    >
                      <FolderInput size={12} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(p.id);
                        setRenameValue(p.name);
                      }}
                      aria-label={`Renombrar proyecto ${p.name}`}
                      className="rounded p-1 text-muted-fg opacity-0 transition-opacity duration-150 hover:bg-muted hover:text-fg group-hover:opacity-100"
                    >
                      <Pencil size={12} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDelete === p.id) {
                          removeProject(p.id);
                          setConfirmDelete(null);
                        } else {
                          setConfirmDelete(p.id);
                        }
                      }}
                      aria-label={
                        confirmDelete === p.id
                          ? `Confirmar eliminar proyecto ${p.name}`
                          : `Eliminar proyecto ${p.name}`
                      }
                      className={`rounded p-1 transition-colors duration-150 hover:bg-muted ${
                        confirmDelete === p.id
                          ? 'text-error opacity-100'
                          : 'text-muted-fg opacity-0 hover:text-error group-hover:opacity-100'
                      }`}
                    >
                      {confirmDelete === p.id ? <Check size={13} aria-hidden /> : <Trash2 size={12} aria-hidden />}
                    </button>
                  </>
                )}
              </div>

              {renaming === p.id ? (
                <div className="flex items-center gap-1 px-1.5 py-0.5">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        useProjectsStore.getState().rename(p.id, renameValue);
                        setRenaming(null);
                      }
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    aria-label={`Nuevo nombre para ${p.name}`}
                    className="w-full rounded border border-ring bg-bg px-2 py-1 text-sm outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Cancelar renombrado"
                    onClick={() => setRenaming(null)}
                    className="rounded p-1 text-muted-fg hover:text-fg"
                  >
                    <X size={13} aria-hidden />
                  </button>
                </div>
              ) : (
                !isCollapsed && (
                  <ul className="mt-0.5 space-y-0.5">
                    {projectChats.map((c) => (
                      <ChatItem
                        key={c.id}
                        chat={c}
                        active={c.id === activeChatId}
                        onSelect={() => setActive(c.id)}
                        onDelete={() => deleteChat(c.id)}
                        pendingDelete={confirmDelete === `chat-${c.id}`}
                        onRequestDelete={() =>
                          setConfirmDelete((prev) =>
                            prev === `chat-${c.id}` ? null : `chat-${c.id}`,
                          )
                        }
                      />
                    ))}
                  </ul>
                )
              )}
            </section>
          );
        })}

        {/* Nuevo proyecto */}
        {newProjectOpen ? (
          <div className="flex items-center gap-1 px-1.5 py-1">
            <input
              autoFocus
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addProject();
                if (e.key === 'Escape') setNewProjectOpen(false);
              }}
              aria-label="Nombre del nuevo proyecto"
              placeholder="Nombre del proyecto"
              className="w-full rounded border border-ring bg-bg px-2 py-1 text-sm outline-none placeholder:text-muted-fg"
            />
            <button
              type="button"
              aria-label="Cancelar nuevo proyecto"
              onClick={() => setNewProjectOpen(false)}
              className="rounded p-1 text-muted-fg hover:text-fg"
            >
              <X size={13} aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNewProjectOpen(true)}
            className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
          >
            <FolderPlus size={14} aria-hidden />
            Nuevo proyecto
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2.5">
        <div className="mb-2 flex rounded-lg border border-border bg-bg p-0.5 text-sm" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'chats'}
            onClick={() => setView('chats')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors duration-200 ${
              view === 'chats' ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg'
            }`}
          >
            <MessageSquare size={14} aria-hidden />
            Chats
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'agents'}
            onClick={() => setView('agents')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors duration-200 ${
              view === 'agents' ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg'
            }`}
          >
            <Users size={14} aria-hidden />
            Agentes
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'usage'}
            onClick={() => setView('usage')}
            aria-label="Ver el uso de tokens"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 transition-colors duration-200 ${
              view === 'usage' ? 'bg-muted text-fg' : 'text-muted-fg hover:text-fg'
            }`}
          >
            <Gauge size={14} aria-hidden />
            Uso
          </button>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-sm text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
          aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          {isDark ? <Sun size={15} aria-hidden /> : <Moon size={15} aria-hidden />}
          Tema {isDark ? 'claro' : 'oscuro'}
        </button>
      </div>
    </aside>
  );
}

function ChatItem({
  chat,
  active,
  onSelect,
  onDelete,
  pendingDelete,
  onRequestDelete,
}: {
  chat: Chat;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
  pendingDelete: boolean;
  onRequestDelete: () => void;
}) {
  return (
    <li>
      <div
        className={`group flex items-center rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 ${
          active ? 'bg-muted text-fg sidebar-active' : 'text-muted-fg hover:bg-muted hover:text-fg'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 truncate text-left"
          aria-current={active ? 'true' : undefined}
        >
          {chat.title || 'Chat nuevo'}
        </button>
        <button
          type="button"
          onClick={() => {
            if (pendingDelete) {
              onDelete();
            } else {
              onRequestDelete();
            }
          }}
          aria-label={pendingDelete ? 'Confirmar eliminar chat' : 'Eliminar chat'}
          className={`rounded p-0.5 transition-colors duration-150 ${
            pendingDelete
              ? 'text-error opacity-100'
              : 'text-muted-fg opacity-0 hover:text-error group-hover:opacity-100'
          }`}
        >
          {pendingDelete ? <Check size={13} aria-hidden /> : <Trash2 size={12} aria-hidden />}
        </button>
      </div>
    </li>
  );
}
