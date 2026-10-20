import { useState, useEffect } from 'react';
import { ClientesPanel } from './cadastro/ClientesPanel';
import { EntregadoresPanel } from './cadastro/EntregadoresPanel';
import { Capacitor } from '@capacitor/core';

export function Cadastro({ onBack, darkMode = false, initialType }: { onBack?: () => void; darkMode?: boolean; initialType?: 'cliente' | 'entregador' | '' }) {
  const getInitialType = () => {
    if (initialType) return initialType;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash === '#comercio') return 'cliente';
      if (hash === '#entregador') return 'entregador';
    }
    return '';
  };

  const [tipo, setTipo] = useState<'cliente' | 'entregador' | ''>(getInitialType());
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative && typeof window !== 'undefined') {
      if (tipo === 'cliente') {
        window.history.replaceState(null, '', '#comercio');
      } else if (tipo === 'entregador') {
        window.history.replaceState(null, '', '#entregador');
      }
    }
  }, [tipo, isNative]);
  
  return (
    <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
        <div className="relative p-8 md:p-10 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/Screenshot_20251113_103247-Photoroom.png" alt="RouteDelivery" className="h-12 md:h-14 object-contain" />
              <div>
                <div className="text-2xl md:text-3xl font-bold">
                  {tipo === 'cliente' ? 'Cadastro Comércio' : tipo === 'entregador' ? 'Cadastro Entregador' : 'Criar conta'}
                </div>
                <div className="text-sm md:text-base text-slate-100">
                  {tipo ? 'Preencha o formulário abaixo' : 'Selecione o tipo de conta para continuar'}
                </div>
              </div>
            </div>
            {onBack ? (
              <button onClick={onBack} className="text-sm md:text-base text-sky-200 hover:text-white">Voltar</button>
            ) : (
              // Comércio volta para a área do lojista (/comercio); entregador volta para a raiz.
              <a href={tipo === 'cliente' ? '/comercio' : '/'} className="text-sm md:text-base text-sky-200 hover:text-white">Voltar</a>
            )}
          </div>
          {!tipo && (
          <div className="relative z-10 mt-5 flex gap-3">
            {!isNative && (
              <button
                onClick={() => setTipo('cliente')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tipo === 'cliente' ? 'bg-sky-600 text-white' : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'}`}
              >
                Comércio
              </button>
            )}
            <button
              onClick={() => setTipo('entregador')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tipo === 'entregador' ? 'bg-sky-600 text-white' : 'bg-white/10 border border-white/20 text-white hover:bg-white/20'}`}
            >
              Entregador
            </button>
          </div>
          )}
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
