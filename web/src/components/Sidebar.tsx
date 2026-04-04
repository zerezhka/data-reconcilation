import { LayoutDashboard, Database, CheckSquare, Settings, RefreshCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type Tab = 'dashboard' | 'datasources' | 'checks' | 'settings';

function SidebarItem({ icon: Icon, label, active, onClick }: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer ${
        active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium text-sm">{label}</span>
    </button>
  );
}

export function Sidebar({ activeTab, onTabChange }: {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}) {
  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col p-4 shrink-0">
      <div className="flex items-center gap-3 px-2 mb-10 mt-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <RefreshCw size={18} className="text-white" />
        </div>
        <h1 className="font-bold tracking-tight text-lg italic">RECONCILER</h1>
      </div>

      <nav className="flex-1 space-y-1">
        <SidebarItem icon={LayoutDashboard} label="Дашборд" active={activeTab === 'dashboard'} onClick={() => onTabChange('dashboard')} />
        <SidebarItem icon={Database} label="Источники данных" active={activeTab === 'datasources'} onClick={() => onTabChange('datasources')} />
        <SidebarItem icon={CheckSquare} label="Проверки" active={activeTab === 'checks'} onClick={() => onTabChange('checks')} />
      </nav>

      <div className="mt-auto pt-4 border-t border-zinc-800">
        <SidebarItem icon={Settings} label="Настройки" active={activeTab === 'settings'} onClick={() => onTabChange('settings')} />
      </div>
    </aside>
  );
}
