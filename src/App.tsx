import { ChatView } from './components/ChatView';

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      {/* Sidebar llega en Task 11 */}
      <ChatView />
    </div>
  );
}
