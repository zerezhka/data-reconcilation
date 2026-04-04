import { Bell, Shield, Cpu, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const items: { title: string; icon: LucideIcon; desc: string; action: string }[] = [
  { title: 'Уведомления', icon: Bell, desc: 'Настройка Telegram/Email алертов при критических расхождениях', action: 'Настроить' },
  { title: 'Безопасность', icon: Shield, desc: 'Управление API-ключами и правами доступа (RBAC)', action: 'Управление' },
  { title: 'Производительность', icon: Cpu, desc: 'Лимиты потребления RAM и количество параллельных потоков сверки', action: 'Лимиты' },
  { title: 'Глобальные прокси', icon: Globe, desc: 'Настройка сетевых шлюзов для доступа к внешним БД', action: 'Прокси' },
];

export function Settings() {
  return (
    <div>
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight">Настройки системы</h2>
        <p className="text-zinc-500 mt-1">Конфигурация параметров работы и безопасности</p>
      </header>

      <div className="max-w-3xl space-y-6">
        {items.map((item, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-zinc-400">
                <item.icon size={20} />
              </div>
              <div>
                <h4 className="font-bold">{item.title}</h4>
                <p className="text-sm text-zinc-500">{item.desc}</p>
              </div>
            </div>
            <button className="text-xs font-bold px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors cursor-pointer">
              {item.action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
