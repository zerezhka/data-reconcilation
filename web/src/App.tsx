import { useState } from 'react';
import { Sidebar, type Tab } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { Datasources } from './components/Datasources';
import { Checks } from './components/Checks';
import { Settings } from './components/Settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 font-sans overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-6xl mx-auto">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'datasources' && <Datasources />}
          {activeTab === 'checks' && <Checks />}
          {activeTab === 'settings' && <Settings />}
        </div>
      </main>
    </div>
  );
}
