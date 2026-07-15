import { Home, MapPin, Truck } from 'lucide-react';

interface EntregadorBottomBarProps {
  onNavigate: (menu: string) => void;
  activeMenu: string;
}

export function EntregadorBottomBar({ onNavigate, activeMenu }: EntregadorBottomBarProps) {
  return (
    <div 
      className="fixed left-4 right-4 z-50 transition-all duration-300"
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => onNavigate('home_entregador')}
          className={`flex flex-col items-center justify-center py-2 bg-white/95 backdrop-blur-sm hover:bg-slate-50 border-2 rounded-xl transition-all shadow-lg group ${
            activeMenu === 'home_entregador' ? 'border-amber-300' : 'border-slate-100 hover:border-slate-300'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-1 ${
            activeMenu === 'home_entregador' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-600'
          }`}>
            <Home size={18} />
          </div>
          <span className="font-semibold text-slate-700 text-xs">Home</span>
        </button>

        <button
          onClick={() => onNavigate('entregas_disponiveis')}
          className={`flex flex-col items-center justify-center py-2 bg-white/95 backdrop-blur-sm hover:bg-sky-50 border-2 rounded-xl transition-all shadow-lg group ${
            activeMenu === 'entregas_disponiveis' ? 'border-sky-300' : 'border-sky-100 hover:border-sky-300'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-1 ${
            activeMenu === 'entregas_disponiveis' ? 'bg-sky-100 text-sky-600' : 'bg-sky-100 text-sky-600'
          }`}>
            <MapPin size={18} />
          </div>
          <span className="font-semibold text-slate-700 text-xs">Disponíveis</span>
        </button>

        <button
          onClick={() => onNavigate('entregas_andamento')}
          className={`flex flex-col items-center justify-center py-2 bg-white/95 backdrop-blur-sm hover:bg-emerald-50 border-2 rounded-xl transition-all shadow-lg group ${
            activeMenu === 'entregas_andamento' ? 'border-emerald-300' : 'border-emerald-100 hover:border-emerald-300'
          }`}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform mb-1 ${
            activeMenu === 'entregas_andamento' ? 'bg-emerald-100 text-emerald-600' : 'bg-emerald-100 text-emerald-600'
          }`}>
            <Truck size={18} />
          </div>
          <span className="font-semibold text-slate-700 text-xs">Em Andamento</span>
        </button>
      </div>
    </div>
  );
}