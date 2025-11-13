import { Map } from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  activeMenu: string;
  onMenuChange: (menu: string) => void;
}

export function Sidebar({ activeMenu, onMenuChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(true);
  const menuItems = [{ id: 'operations', label: 'Menu de Operações', icon: Map }];

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-64'} bg-slate-900 text-white min-h-screen flex flex-col transition-all duration-200`}
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
    >
      <div className="p-6 border-b border-slate-700 flex items-center justify-center">
        {collapsed ? (
          <img
            src="/Screenshot_20251113_103247-Photoroom.png"
            alt="RouteDelivery"
            className="h-8 object-contain"
          />
        ) : (
          <img
            src="/Screenshot_20251113_103247-Photoroom.png"
            alt="RouteDelivery"
            className="h-20 object-contain"
          />
        )}
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
                  className={`w-full flex items-center ${collapsed ? 'justify-center h-12 px-0' : 'gap-3 px-4 py-3'} rounded-lg transition-all ${
                    isActive
                      ? 'bg-sky-500 text-white shadow-lg'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon size={20} />
                  {!collapsed && <span className="font-medium">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-slate-700">
        {!collapsed && (
          <div className="text-slate-400 text-xs text-center">v1.0.0</div>
        )}
      </div>
    </aside>
  );
}
