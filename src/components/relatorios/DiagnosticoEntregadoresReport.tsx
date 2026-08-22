import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { AlertTriangle, Star } from 'lucide-react';

type Entregador = Pick<Database['public']['Tables']['entregadores']['Row'], 'id' | 'nome_completo' | 'foto_url' | 'status' | 'veiculo_modelo' | 'veiculo_placa'>;
type Avaliacao = Database['public']['Tables']['entregador_avaliacoes']['Row'];

export function DiagnosticoEntregadoresReport() {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const { data: entData } = await supabase.from('entregadores').select('id, nome_completo, foto_url, status, veiculo_modelo, veiculo_placa');
      if (entData) setEntregadores(entData);

      const { data: avData } = await supabase.from('entregador_avaliacoes').select('*');
      if (avData) setAvaliacoes(avData);
    } catch (error) {
      console.error('Erro ao buscar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  const diagnostico = useMemo(() => {
    return entregadores.map(ent => {
      const avs = avaliacoes.filter(a => a.entregador_id === ent.id);
      const total = avs.length;
      const media = total > 0 ? avs.reduce((acc, curr) => acc + (curr.nota || 0), 0) / total : 0;
      const negativas = avs.filter(a => (a.nota || 0) < 3).length;
      const recentes = avs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 3);

      return {
        ...ent,
        totalAvaliacoes: total,
        mediaNota: media,
        avaliacoesNegativas: negativas,
        ultimasAvaliacoes: recentes
      };
    }).sort((a, b) => a.mediaNota - b.mediaNota); // Piores notas primeiro para diagnóstico de problemas
  }, [entregadores, avaliacoes]);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Diagnóstico de Entregadores</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Média Geral da Frota</div>
          <div className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            {(diagnostico.reduce((acc, curr) => acc + curr.mediaNota, 0) / Math.max(1, diagnostico.filter(d => d.totalAvaliacoes > 0).length)).toFixed(1)}
            <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Total de Avaliações</div>
          <div className="text-2xl font-bold text-slate-800">{avaliacoes.length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">Entregadores em Risco (Média &lt; 3.0)</div>
          <div className="text-2xl font-bold text-red-600 flex items-center gap-2">
            {diagnostico.filter(d => d.totalAvaliacoes > 0 && d.mediaNota < 3).length}
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loading ? (
          <div className="text-center py-8 text-slate-500">Carregando diagnóstico...</div>
        ) : diagnostico.length === 0 ? (
          <div className="text-center py-8 text-slate-500">Nenhum entregador encontrado.</div>
        ) : (
          diagnostico.map(ent => (
            <div key={ent.id} className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
              <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-lg overflow-hidden">
                    {ent.foto_url ? (
                      <img src={ent.foto_url} alt={ent.nome_completo} className="w-full h-full object-cover" />
                    ) : (
                      ent.nome_completo.charAt(0)
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{ent.nome_completo}</h3>
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ent.status === 'ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {ent.status.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span>{ent.veiculo_modelo || 'Veículo n/a'} ({ent.veiculo_placa || 'Sem placa'})</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase">Média</div>
                    <div className={`text-xl font-bold ${ent.mediaNota >= 4.5 ? 'text-emerald-600' : ent.mediaNota >= 3 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {ent.mediaNota.toFixed(1)}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase">Avaliações</div>
                    <div className="text-xl font-bold text-slate-700">{ent.totalAvaliacoes}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-500 uppercase">Negativas</div>
                    <div className="text-xl font-bold text-red-500">{ent.avaliacoesNegativas}</div>
                  </div>
                </div>
              </div>

              {ent.ultimasAvaliacoes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Últimos Feedbacks</h4>
                  <div className="space-y-2">
                    {ent.ultimasAvaliacoes.map(av => (
                      <div key={av.id} className="text-sm bg-slate-50 p-2 rounded flex gap-2">
                        <span className={`font-bold ${av.nota && av.nota < 3 ? 'text-red-600' : 'text-slate-700'}`}>
                          {av.nota?.toFixed(1)}
                        </span>
                        <span className="text-slate-600">{av.comentario || 'Sem comentário'}</span>
                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(av.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
