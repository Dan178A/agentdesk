import '../test/mock-ipc';
import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectsStore } from './projects';
import { useChatStore } from './chat';
import { resetIpc, onInvoke, ipcCalls } from '../test/mock-ipc';

beforeEach(() => {
  resetIpc();
  onInvoke('projects_save', async () => {});
  useProjectsStore.setState({ projects: [], collapsed: {} });
  useChatStore.setState({ chats: [], activeChatId: null, isGenerating: false }, false);
  useChatStore.getState().init();
});

describe('store de proyectos', () => {
  it('load crea el proyecto General si no hay', async () => {
    onInvoke('projects_load', async () => null);
    await useProjectsStore.getState().load();
    expect(useProjectsStore.getState().projects[0]?.id).toBe('general');
    expect(useProjectsStore.getState().projects[0]?.name).toBe('General');
  });

  it('create añade proyecto con id y persiste', () => {
    const p = useProjectsStore.getState().create('Freelance');
    expect(p.id).toBeTruthy();
    expect(useProjectsStore.getState().projects.some((x) => x.name === 'Freelance')).toBe(true);
    expect(ipcCalls().some((c) => c.cmd === 'projects_save')).toBe(true);
  });

  it('rename cambia el nombre', () => {
    const p = useProjectsStore.getState().create('Viejo');
    useProjectsStore.getState().rename(p.id, 'Nuevo');
    expect(useProjectsStore.getState().projects.find((x) => x.id === p.id)?.name).toBe('Nuevo');
  });

  it('remove no puede eliminar General', () => {
    useProjectsStore.setState({ projects: [{ id: 'general', name: 'General' }] });
    useProjectsStore.getState().remove('general');
    expect(useProjectsStore.getState().projects.some((p) => p.id === 'general')).toBe(true);
  });

  it('remove mueve los chats del proyecto a general (RF-15)', () => {
    const p = useProjectsStore.getState().create('Temporal');
    useChatStore.setState((s) => ({
      chats: s.chats.map((c) => ({ ...c, projectId: p.id })),
    }));
    useProjectsStore.getState().remove(p.id);
    expect(useChatStore.getState().chats.every((c) => c.projectId === 'general')).toBe(true);
    expect(useProjectsStore.getState().projects.some((x) => x.id === p.id)).toBe(false);
  });

  it('toggleCollapse alterna', () => {
    useProjectsStore.getState().toggleCollapse('general');
    expect(useProjectsStore.getState().collapsed['general']).toBe(true);
    useProjectsStore.getState().toggleCollapse('general');
    expect(useProjectsStore.getState().collapsed['general']).toBe(false);
  });
});
