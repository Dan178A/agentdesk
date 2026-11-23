import { useState } from 'react';
import { PanelLeftOpen } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentsView } from './components/AgentsView';
import { PreviewPanel } from './components/PreviewPanel';
import { useAgentsStore } from './store/agents';

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const view = useAgentsStore((s) => s.view);

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      {sidebarOpen && <Sidebar onToggle={() => setSidebarOpen(false)} />}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="Mostrar barra lateral"
          className="absolute left-3 top-3 z-10 rounded-lg border border-border bg-surface p-2 text-muted-fg transition-colors duration-200 hover:bg-muted hover:text-fg"
        >
          <PanelLeftOpen size={16} aria-hidden />
        </button>
      )}
      {view === 'agents' ? <AgentsView /> : <ChatView />}
      <PreviewPanel />
    </div>
  );
}
