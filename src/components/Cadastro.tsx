import { useState } from 'react';
import { ClientesPanel } from './cadastro/ClientesPanel';
import { EntregadoresPanel } from './cadastro/EntregadoresPanel';

export function Cadastro({ onBack, darkMode = false }: { onBack?: () => void; darkMode?: boolean }) {
  const [tipo, setTipo] = useState<'cliente' | 'entregador' | ''>('');
  return (
    <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
        <div className="relative p-8 md:p-10 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/Screenshot_20251113_103247-Photoroom.png" alt="RouteDelivery" className="h-12 md:h-14 object-contain" />
              <div>
                <div className="text-2xl md:text-3xl font-bold">Criar conta</div>
                <div className="text-sm md:text-base text-slate-100">Selecione o tipo e preencha o cadastro completo</div>
              </div>
            </div>
            {onBack ? (
              <button onClick={onBack} className="text-sm md:text-base text-sky-200 hover:text-white">Voltar</button>
            ) : (
              <a href="/" className="text-sm md:text-base text-sky-200 hover:text-white">Voltar</a>
            )}
          </div>
          <div className="relative z-10 mt-5 flex gap-3">
            <button
              onClick={() => setTipo('cliente')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tipo === 'cliente' ? 'bg-sky-600 text-white' : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'}`}
            >
              Comércio
            </button>
            <button
              onClick={() => setTipo('entregador')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tipo === 'entregador' ? 'bg-sky-600 text-white' : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'}`}
            >
              Entregador
            </button>
          </div>
        </div>
        <div className="p-2">
          {tipo === 'cliente' && <ClientesPanel mode="public" />}
          {tipo === 'entregador' && <EntregadoresPanel mode="public" />}
          {!tipo && (
            <div className="p-6 text-slate-700 text-sm">Escolha uma opção acima para iniciar o cadastro.</div>
          )}
        </div>
      </div>
    </div>
  );
}