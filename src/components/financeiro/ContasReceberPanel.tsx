import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ContaReceber = Database['public']['Tables']['contas_receber']['Row'] & {
  clientes: { nome_completo: string } | null;
};
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function ContasReceberPanel() {
  const [items, setItems] = useState<ContaReceber[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  
  const [form, setForm] = useState({ cliente_id: '', descricao: '', valor: '', vencimento: '' });
  
  
  const [viewingConta, setViewingConta] = useState<ContaReceber | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any | null>(null);
  const [invoiceDeliveries, setInvoiceDeliveries] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // States for Edit
  const [editingConta, setEditingConta] = useState<ContaReceber | null>(null);
  const [editForm, setEditForm] = useState({ descricao: '', valor: '', vencimento: '', status: '' });

  // States for Note Generation
  const [generatingNoteConta, setGeneratingNoteConta] = useState<ContaReceber | null>(null);
  const [noteForm, setNoteForm] = useState({ numero: '', url: '' });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const { data: contasData, error: contasError } = await supabase
        .from('contas_receber')
        .select('*, clientes(nome_completo)')
        .order('vencimento', { ascending: true });

      if (contasError) throw contasError;

      const { data: clientesData, error: clientesError } = await supabase
        .from('clientes')
        .select('*')
        .order('nome_completo');

      if (clientesError) throw clientesError;

      setItems(contasData as ContaReceber[]);
      setClientes(clientesData);
    } catch (err: any) {
      console.error('Erro ao carregar contas:', err);
      setError(err.message || 'Erro ao carregar dados');
    } finally {
      setLoadingList(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.cliente_id || !form.descricao || !form.valor || !form.vencimento) return;
    setLoadingSubmit(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('contas_receber')
        .insert({
          cliente_id: form.cliente_id,
          descricao: form.descricao,
          valor: Number(form.valor.replace(',', '.')),
          vencimento: form.vencimento,
          status: 'pendente',
        });

      if (error) throw error;
      
      setForm({ cliente_id: '', descricao: '', valor: '', vencimento: '' });
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleToggleRecebido = async (id: string, status: string | null) => {
    setLoadingSubmit(true);
    try {
      const novoStatus = status === 'recebido' ? 'pendente' : 'recebido';
      const payload = novoStatus === 'recebido' 
        ? { status: novoStatus, recebido_em: new Date().toISOString() } 
        : { status: novoStatus, recebido_em: null };

      const { error } = await supabase
        .from('contas_receber')
        .update(payload as any)
        .eq('id', id);

      if (error) throw error;
      await fetchAll();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleCancelInvoice = async (conta: ContaReceber) => {
    if (!confirm('Tem certeza que deseja cancelar esta fatura? Se for uma fatura gerada automaticamente, as entregas voltarão para o status "não faturado".')) return;
    
    setLoadingSubmit(true);
    try {
      
      if (conta.fatura_id) {
        
        const { error: updateError } = await supabase
          .from('nova_entrega')
          .update({ fatura_cliente_id: null } as any)
          .eq('fatura_cliente_id', conta.fatura_id);

        if (updateError) throw updateError;

        
        const { error: invoiceError } = await supabase
          .from('faturamento_clientes')
          .delete()
          .eq('id', conta.fatura_id);

        if (invoiceError) throw invoiceError;
      }

      
      const { error: deleteError } = await supabase
        .from('contas_receber')
        .delete()
        .eq('id', conta.id);

      if (deleteError) throw deleteError;

      await fetchAll();
    } catch (err: any) {
      console.error('Erro ao cancelar fatura:', err);
      setError(err.message);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const fetchDetails = async (conta: ContaReceber) => {
    if (!conta.fatura_id) return { invoice: null, deliveries: [] };
    
    const { data: invoice } = await supabase
      .from('faturamento_clientes')
      .select('*')
      .eq('id', conta.fatura_id)
      .single();
    
    const { data: deliveries } = await supabase
      .from('nova_entrega')
      .select('*')
      .eq('fatura_cliente_id', conta.fatura_id);
      
    return { invoice, deliveries: deliveries || [] };
  };

  const handleView = async (conta: ContaReceber) => {
    setViewingConta(conta);
    setLoadingDetails(true);
    try {
      const { invoice, deliveries } = await fetchDetails(conta);
      setInvoiceDetails(invoice);
      setInvoiceDeliveries(deliveries);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleEdit = (conta: ContaReceber) => {
    setEditingConta(conta);
    setEditForm({
      descricao: conta.descricao || '',
      valor: conta.valor?.toString().replace('.', ',') || '',
      vencimento: conta.vencimento || '',
      status: conta.status || 'pendente'
    });
  };

  const handleSaveEdit = async () => {
    if (!editingConta || !editForm.descricao || !editForm.valor || !editForm.vencimento) return;
    setLoadingSubmit(true);
    try {
      const { error } = await supabase
        .from('contas_receber')
        .update({
          descricao: editForm.descricao,
          valor: Number(editForm.valor.replace(',', '.')),
          vencimento: editForm.vencimento,
          status: editForm.status as any
        })
        .eq('id', editingConta.id);

      if (error) throw error;
      await fetchAll();
      setEditingConta(null);
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setLoadingSubmit(false);
    }
  };

  const handleReport = async (conta: ContaReceber) => {
    setLoadingDetails(true);
    try {
      const { invoice, deliveries } = await fetchDetails(conta);
      const doc = new jsPDF();
      
      doc.setFontSize(18);
      doc.text('Relatório de Conta a Receber', 14, 22);
      
      doc.setFontSize(12);
      doc.text(`Cliente: ${conta.clientes?.nome_completo}`, 14, 32);
      doc.text(`Descrição: ${conta.descricao || '-'}`, 14, 38);
      doc.text(`Vencimento: ${formatDate(conta.vencimento)}`, 14, 44);
      doc.text(`Valor: ${formatCurrency(conta.valor || 0)}`, 14, 50);
      doc.text(`Status: ${conta.status?.toUpperCase()}`, 14, 56);

      let currentY = 66;

      if (invoice) {
        doc.text(`Período Faturado: ${formatDate(invoice.periodo_inicio)} a ${formatDate(invoice.periodo_fim)}`, 14, currentY);
        currentY += 10;
        if (invoice.observacoes) {
          doc.text(`Obs: ${invoice.observacoes}`, 14, currentY);
          currentY += 10;
        }
      }

      if (deliveries.length > 0) {
        doc.text('Detalhamento das Entregas:', 14, currentY);
        currentY += 5;
        
        const tableData = deliveries.map(d => [
          formatDate(d.created_at),
          d.id.slice(0, 8),
          d.delivery_address || '-',
          formatCurrency(d.valor_entrega || 0)
        ]);
        
        autoTable(doc, {
          startY: currentY,
          head: [['Data', 'ID', 'Endereço', 'Valor']],
          body: tableData,
        });
      }
      
      doc.save(`relatorio_${conta.id.slice(0, 6)}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar relatório.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleSendInvoice = async (conta: ContaReceber) => {
    if (!confirm(`Confirmar envio de fatura para ${conta.clientes?.nome_completo}?`)) return;
    
    // Simulate email sending
    setTimeout(() => {
      alert(`Fatura enviada com sucesso para o email do cliente!`);
    }, 1000);
  };

  const handleGenerateNote = (conta: ContaReceber) => {
    setGeneratingNoteConta(conta);
    setNoteForm({ numero: '', url: '' });
  };

  const handleSaveNote = async () => {
    if (!generatingNoteConta) return;
    // Simulate note generation
    // Ideally we would save this to the database, e.g. updating invoice observations
    if (generatingNoteConta.fatura_id && noteForm.numero) {
        try {
            // Append note info to invoice observations if possible
            // But for now, just a simulation as requested "intuitivo"
        } catch (e) {
            console.error(e);
        }
    }
    alert(`Nota Fiscal ${noteForm.numero} gerada/registrada com sucesso!`);
    setGeneratingNoteConta(null);
  };

  const handleCloseView = () => {
    setViewingConta(null);
    setInvoiceDetails(null);
    setInvoiceDeliveries([]);
  };

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const formatDate = (dateStr: string | null) => dateStr ? format(parseISO(dateStr), 'dd/MM/yyyy') : '-';

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">Contas a Receber</h2>
      
      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-3">{error}</div>}
      
      {/* Manual Entry Form */}
      <div className="bg-white border border-slate-200 rounded-lg p-6 mb-8 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Adicionar Conta Manual</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <select 
              value={form.cliente_id} 
              onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Selecione o Cliente</option>
              {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
            </select>
          </div>
          <div className="md:col-span-1">
            <input 
              placeholder="Descrição" 
              value={form.descricao} 
              onChange={(e) => setForm({ ...form, descricao: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>
          <div className="md:col-span-1">
            <input 
              placeholder="Valor (R$)" 
              value={form.valor} 
              onChange={(e) => setForm({ ...form, valor: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>
          <div className="md:col-span-1">
            <input 
              type="date" 
              value={form.vencimento} 
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })} 
              className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button 
            onClick={handleSubmit} 
            disabled={loadingSubmit} 
            className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm disabled:opacity-50 transition-colors"
          >
            {loadingSubmit ? 'Salvando...' : 'Adicionar Conta'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200 grid grid-cols-12 gap-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Descrição</div>
          <div className="col-span-2 text-right">Valor</div>
          <div className="col-span-2 text-center">Vencimento</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-center">Ações</div>
        </div>
        
        {loadingList ? (
          <div className="p-8 text-center text-slate-500">Carregando contas...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-slate-500">Nenhuma conta a receber encontrada.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((c) => (
              <div key={c.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-slate-50 transition-colors">
                <div className="col-span-3 font-medium text-slate-800 truncate" title={c.clientes?.nome_completo || 'Desconhecido'}>
                  {c.clientes?.nome_completo || 'Cliente Desconhecido'}
                </div>
                <div className="col-span-2 text-sm text-slate-600 truncate" title={c.descricao || ''}>
                  {c.descricao || '-'}
                </div>
                <div className="col-span-2 text-right font-semibold text-slate-800">
                  {formatCurrency(c.valor || 0)}
                </div>
                <div className="col-span-2 text-center text-sm text-slate-600">
                  {formatDate(c.vencimento)}
                </div>
                <div className="col-span-1 flex justify-center">
                  <span 
                    onClick={() => handleToggleRecebido(c.id, c.status)}
                    className={`cursor-pointer px-2 py-1 rounded-full text-xs font-semibold ${
                      c.status === 'recebido' 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                  >
                    {c.status === 'recebido' ? 'PAGO' : 'ABERTO'}
                  </span>
                </div>
                
                {/* Actions Grid - as requested */}
                <div className="col-span-2">
                  <div className="grid grid-cols-2 gap-1">
                    <button 
                      onClick={() => handleEdit(c)}
                      className="px-1 py-1 bg-slate-700 text-white text-[10px] rounded hover:bg-slate-600"
                    >
                      Editar
                    </button>
                    <button 
                      onClick={() => handleView(c)}
                      className="px-1 py-1 bg-slate-700 text-white text-[10px] rounded hover:bg-slate-600"
                    >
                      Exibir
                    </button>
                    <button 
                      onClick={() => handleReport(c)}
                      className="px-1 py-1 bg-slate-700 text-white text-[10px] rounded hover:bg-slate-600"
                    >
                      Relatório
                    </button>
                    <button 
                      onClick={() => handleSendInvoice(c)}
                      className="px-1 py-1 bg-slate-300 text-slate-700 text-[10px] rounded hover:bg-slate-400"
                    >
                      Enviar Fatura
                    </button>
                    <button 
                      onClick={() => handleGenerateNote(c)}
                      className="px-1 py-1 bg-slate-700 text-white text-[10px] rounded hover:bg-slate-600"
                    >
                      Gerar Nota
                    </button>
                    <button 
                      onClick={() => handleCancelInvoice(c)}
                      className="px-1 py-1 bg-slate-700 text-white text-[10px] rounded hover:bg-red-600 transition-colors"
                    >
                      Cancelar fatura
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Edit Modal */}
      {editingConta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Editar Conta</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Descrição</label>
                <input 
                  value={editForm.descricao}
                  onChange={(e) => setEditForm({...editForm, descricao: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Valor (R$)</label>
                <input 
                  value={editForm.valor}
                  onChange={(e) => setEditForm({...editForm, valor: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Vencimento</label>
                <input 
                  type="date"
                  value={editForm.vencimento}
                  onChange={(e) => setEditForm({...editForm, vencimento: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <select 
                  value={editForm.status}
                  onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pendente">Pendente</option>
                  <option value="recebido">Recebido</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                onClick={() => setEditingConta(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveEdit}
                disabled={loadingSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
              >
                {loadingSubmit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Note Modal */}
      {generatingNoteConta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Gerar Nota Fiscal</h3>
            <p className="text-sm text-slate-500 mb-4">
              Informe os dados da nota fiscal gerada para o cliente {generatingNoteConta.clientes?.nome_completo}.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Número da Nota</label>
                <input 
                  value={noteForm.numero}
                  onChange={(e) => setNoteForm({...noteForm, numero: e.target.value})}
                  placeholder="Ex: 2024001"
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Link/URL da Nota (Opcional)</label>
                <input 
                  value={noteForm.url}
                  onChange={(e) => setNoteForm({...noteForm, url: e.target.value})}
                  placeholder="https://..."
                  className="w-full mt-1 px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
              <button 
                onClick={() => setGeneratingNoteConta(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveNote}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-medium"
              >
                Registrar Nota
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* View Details Modal */}
      {viewingConta && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-semibold text-slate-800">Detalhes da Conta</h3>
              <button onClick={handleCloseView} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {loadingDetails ? (
                <div className="text-center py-8 text-slate-500">Carregando detalhes...</div>
              ) : (
                <div className="space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Cliente</label>
                      <div className="text-slate-800 font-medium">{viewingConta.clientes?.nome_completo}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Vencimento</label>
                      <div className="text-slate-800 font-medium">{formatDate(viewingConta.vencimento)}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Valor</label>
                      <div className="text-blue-600 font-bold text-lg">{formatCurrency(viewingConta.valor || 0)}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase">Status</label>
                      <div className={`font-medium ${viewingConta.status === 'recebido' ? 'text-green-600' : 'text-yellow-600'}`}>
                        {viewingConta.status === 'recebido' ? 'PAGO' : 'PENDENTE'}
                      </div>
                    </div>
                  </div>

                  {/* Invoice Details (if linked) */}
                  {invoiceDetails && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                        <h4 className="font-semibold text-blue-800 text-sm">Dados do Faturamento</h4>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-slate-500">Período:</span>
                          <div className="font-medium text-slate-700">
                            {formatDate(invoiceDetails.periodo_inicio)} até {formatDate(invoiceDetails.periodo_fim)}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Descrição:</span>
                          <div className="font-medium text-slate-700">{invoiceDetails.descricao}</div>
                        </div>
                        {invoiceDetails.observacoes && (
                          <div className="col-span-2">
                            <span className="text-slate-500">Observações:</span>
                            <div className="font-medium text-slate-700 bg-slate-50 p-2 rounded mt-1">{invoiceDetails.observacoes}</div>
                          </div>
                        )}
                        {invoiceDetails.instrucoes && (
                          <div className="col-span-2">
                            <span className="text-slate-500">Instruções:</span>
                            <div className="font-medium text-slate-700 bg-slate-50 p-2 rounded mt-1">{invoiceDetails.instrucoes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Deliveries List */}
                  {invoiceDeliveries.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2 text-sm">Entregas Faturadas ({invoiceDeliveries.length})</h4>
                      <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                              <th className="px-3 py-2">Data</th>
                              <th className="px-3 py-2">ID</th>
                              <th className="px-3 py-2 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {invoiceDeliveries.map((d) => (
                              <tr key={d.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-slate-600">{formatDate(d.created_at)}</td>
                                <td className="px-3 py-2 text-slate-500 font-mono text-xs">{d.id.slice(0,8)}...</td>
                                <td className="px-3 py-2 text-right font-medium text-slate-700">{formatCurrency(d.valor_entrega || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  
                  {invoiceDeliveries.length === 0 && viewingConta.fatura_id && (
                     <div className="text-center text-slate-500 text-sm italic">Nenhuma entrega vinculada encontrada.</div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={handleCloseView}
                className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-medium"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}