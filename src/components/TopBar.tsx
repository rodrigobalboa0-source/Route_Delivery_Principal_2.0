interface TopBarProps {
  onMenuToggle: () => void;
  userName?: string;
}

export function TopBar({ onMenuToggle, userName }: TopBarProps) {
  return (
    <header className="w-full h-14 bg-slate-900 text-white flex items-center justify-between px-4 border-b border-slate-800">
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
      <div className="text-sm text-slate-300">
        {`Olá, ${userName || 'usuário'}`}
      </div>
    </header>
  );
}