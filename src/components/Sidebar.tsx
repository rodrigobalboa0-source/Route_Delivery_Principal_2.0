import { Map } from 'lucide-react';

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ activeMenu, onMenuChange, isOpen, onClose }: SidebarProps) {
  const menuItems = [{ id: 'operations', label: 'Menu de Operações', icon: Map }];

  return (
    <aside
      className={`fixed top-0 left-0 h-screen w-56 bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-200 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="h-14 px-4 border-b border-slate-800 flex items-center justify-between">
        <div className="font-semibold">Menu</div>
        <button onClick={onClose} className="p-2 rounded hover:bg-slate-800" aria-label="Fechar menu">
          <span className="block w-4 h-0.5 bg-white rotate-45 translate-y-0.5" />
          <span className="block w-4 h-0.5 bg-white -rotate-45 -translate-y-0.5" />
        </button>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.id;

            return (
              <li key={item.id}>
                <button
                  onClick={() => onMenuChange(item.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-sm ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        <div className="text-slate-400 text-xs text-center">v1.0.0</div>
      </div>
    </aside>
  );
}
