import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Tag } from 'lucide-react';

interface Promocao {
  id: string;
  descricao: string;
  imagem_url: string;
  ativa: boolean;
  created_at: string;
}

export function PromocoesEntregadorPanel() {
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPromocoes();
  }, []);

  const fetchPromocoes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('promocoes')
      .select('*')
      .eq('ativa', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar promoções:', error);
    } else {
      setPromocoes(data || []);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-slate-500">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-slate-200 rounded-full mb-4"></div>
          <div className="h-4 w-32 bg-slate-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto pb-24">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
          <Tag size={24} />
        </div>
        <h1 className="text-xl font-bold text-slate-800">Promoções Ativas</h1>
      </div>

      {promocoes.length === 0 ? (
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-slate-100">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
            <Tag size={32} />
          </div>
          <h3 className="text-lg font-medium text-slate-700 mb-2">Nenhuma promoção</h3>
          <p className="text-slate-500 text-sm">Fique atento! Em breve teremos novidades para você.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {promocoes.map((promocao) => (
            <div key={promocao.id} className="bg-white rounded-xl overflow-hidden shadow-md border border-slate-100 transform transition-all hover:scale-[1.02]">
              <div className="aspect-video w-full bg-slate-100 relative">
                <img 
                  src={promocao.imagem_url} 
                  alt="Promoção" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm">
                  NOVIDADE
                </div>
              </div>
              <div className="p-4">
                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">{promocao.descricao}</p>
                <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center text-xs text-slate-400">
                  <span>Válida por tempo limitado</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
