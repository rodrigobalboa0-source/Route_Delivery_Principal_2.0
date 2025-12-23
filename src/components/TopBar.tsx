interface TopBarProps {
  onMenuToggle: () => void;
  onLogout: () => void;
  activeMenu: string;
  userRole: 'operador' | 'cliente' | 'entregador';
  userName?: string;
}

export function TopBar({ onMenuToggle, onLogout, activeMenu, userRole, userName }: TopBarProps) {
  const fallback = (() => {
    if (userRole === 'operador') return 'Administrador';
    if (userRole === 'cliente') return 'Cliente';
    if (userRole === 'entregador') return 'Entregador';
    if (typeof activeMenu === 'string' && activeMenu.startsWith('operations')) return 'Administrador';
    return 'usuário';
  })();
  return (
    <header className="w-full min-h-[3.5rem] h-auto pt-[env(safe-area-inset-top)] bg-slate-900 text-white flex items-center justify-between px-4 border-b border-slate-800 relative z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          aria-label="Abrir menu"
          className="p-2 rounded hover:bg-slate-800"
        >
          <span className="block w-5 h-0.5 bg-white mb-1" />
          <span className="block w-5 h-0.5 bg-white mb-1" />
          <span className="block w-5 h-0.5 bg-white" />
        </button>
        <img
          src="/Screenshot_20251113_103247-Photoroom.png"
          alt="RouteDelivery"
          className="h-12 md:h-16 object-contain"
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="text-sm text-slate-300">{`Olá, ${userName || fallback}`}</div>
        <button onClick={onLogout} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm">Sair</button>
      </div>
    </header>
  );
}
