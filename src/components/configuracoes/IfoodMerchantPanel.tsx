import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Store,
  RefreshCw,
  Plus,
  Trash2,
  ChevronLeft,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  PauseCircle,
} from 'lucide-react';
import { Modal } from '../Modal';

type Tab = 'info' | 'pausas' | 'horarios';

interface Props {
  clienteId: string;
  defaultMerchantId?: string;
  onBack: () => void;
}

const DAYS_PT: Record<string, string> = {
  MONDAY: 'Segunda-feira',
  TUESDAY: 'Terça-feira',
  WEDNESDAY: 'Quarta-feira',
  THURSDAY: 'Quinta-feira',
  FRIDAY: 'Sexta-feira',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

async function callMerchant(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('ifood-merchant', { body });
  if (error) throw new Error(error.message || 'Erro na função ifood-merchant');
  if (data?.error) throw new Error(data.error);
  return data;
}

export function IfoodMerchantPanel({ clienteId, defaultMerchantId, onBack }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('info');

  // --- info tab ---
  const [merchants, setMerchants] = useState<any[]>([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState(defaultMerchantId || '');
  const [merchantDetails, setMerchantDetails] = useState<any>(null);
  const [merchantStatus, setMerchantStatus] = useState<any>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // --- pausas tab ---
  const [interruptions, setInterruptions] = useState<any[]>([]);
  const [pausaLoading, setPausaLoading] = useState(false);
  const [pausaError, setPausaError] = useState<string | null>(null);
  const [pausaModal, setPausaModal] = useState(false);
  const [pausaForm, setPausaForm] = useState({ description: '', start: '', end: '' });
  const [pausaSaving, setPausaSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // --- horarios tab ---
  const [openingHours, setOpeningHours] = useState<any>(null);
  const [horariosLoading, setHorariosLoading] = useState(false);
  const [horariosError, setHorariosError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<Record<string, { start: string; end: string }[]>>({});
  const [horariosSaving, setHorariosSaving] = useState(false);

  const loadMerchants = useCallback(async () => {
    setInfoLoading(true);
    setInfoError(null);
    try {
      const data = await callMerchant({ action: 'listMerchants', cliente_id: clienteId });
      const list: any[] = Array.isArray(data.merchants) ? data.merchants : [];
      setMerchants(list);
      const firstId = list[0]?.id || defaultMerchantId || '';
      const currentId = selectedMerchantId || firstId;
      setSelectedMerchantId(currentId);
      if (currentId) {
        await loadMerchantDetails(currentId);
      }
    } catch (e: any) {
      setInfoError(e.message || 'Erro ao listar lojas');
    } finally {
      setInfoLoading(false);
    }
  }, [clienteId, defaultMerchantId]);

  const loadMerchantDetails = async (merchantId: string) => {
    setInfoLoading(true);
    setInfoError(null);
    try {
      const [detailData, statusData] = await Promise.all([
        callMerchant({ action: 'getMerchant', cliente_id: clienteId, merchantId }),
        callMerchant({ action: 'getStatus', cliente_id: clienteId, merchantId }),
      ]);
      setMerchantDetails(detailData.merchant);
      setMerchantStatus(statusData.status);
    } catch (e: any) {
      setInfoError(e.message || 'Erro ao carregar detalhes da loja');
    } finally {
      setInfoLoading(false);
    }
  };

  const loadInterruptions = useCallback(async () => {
    if (!selectedMerchantId) return;
    setPausaLoading(true);
    setPausaError(null);
    try {
      const data = await callMerchant({ action: 'listInterruptions', cliente_id: clienteId, merchantId: selectedMerchantId });
      setInterruptions(Array.isArray(data.interruptions) ? data.interruptions : []);
    } catch (e: any) {
      setPausaError(e.message || 'Erro ao listar pausas');
    } finally {
      setPausaLoading(false);
    }
  }, [clienteId, selectedMerchantId]);

  const handleCreateInterruption = async () => {
    if (!pausaForm.description || !pausaForm.start || !pausaForm.end) {
      alert('Preencha todos os campos');
      return;
    }
    setPausaSaving(true);
    try {
      await callMerchant({
        action: 'createInterruption',
        cliente_id: clienteId,
        merchantId: selectedMerchantId,
        payload: {
          description: pausaForm.description,
          start: new Date(pausaForm.start).toISOString(),
          end: new Date(pausaForm.end).toISOString(),
        },
      });
      setPausaModal(false);
      setPausaForm({ description: '', start: '', end: '' });
      await loadInterruptions();
    } catch (e: any) {
      alert(e.message || 'Erro ao criar pausa');
    } finally {
      setPausaSaving(false);
    }
  };

  const handleDeleteInterruption = async (interruptionId: string) => {
    if (!confirm('Remover esta pausa?')) return;
    setDeletingId(interruptionId);
    try {
      await callMerchant({
        action: 'deleteInterruption',
        cliente_id: clienteId,
        merchantId: selectedMerchantId,
        interruptionId,
      });
      await loadInterruptions();
    } catch (e: any) {
      alert(e.message || 'Erro ao remover pausa');
    } finally {
      setDeletingId(null);
    }
  };

  const loadOpeningHours = useCallback(async () => {
    if (!selectedMerchantId) return;
    setHorariosLoading(true);
    setHorariosError(null);
    try {
      const data = await callMerchant({ action: 'getOpeningHours', cliente_id: clienteId, merchantId: selectedMerchantId });
      setOpeningHours(data.openingHours);
      initScheduleForm(data.openingHours);
    } catch (e: any) {
      setHorariosError(e.message || 'Erro ao carregar horários');
    } finally {
      setHorariosLoading(false);
    }
  }, [clienteId, selectedMerchantId]);

  const initScheduleForm = (raw: any) => {
    const form: Record<string, { start: string; end: string }[]> = {};
    DAY_ORDER.forEach((d) => (form[d] = []));

    const schedules: any[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.schedules)
        ? raw.schedules
        : Array.isArray(raw?.shifts)
          ? raw.shifts
          : [];

    for (const item of schedules) {
      const day: string = (item.dayOfWeek || item.day || '').toUpperCase();
      if (!form[day]) form[day] = [];
      const periods: any[] = Array.isArray(item.timePeriods)
        ? item.timePeriods
        : Array.isArray(item.shifts)
          ? item.shifts
          : item.opening
            ? [item]
            : [];
      for (const p of periods) {
        const start = p.start || p.opening || '';
        const end = p.end || p.closing || '';
        if (start && end) form[day].push({ start, end });
      }
    }
    setScheduleForm(form);
  };

  const addSlot = (day: string) => {
    setScheduleForm((prev) => ({ ...prev, [day]: [...(prev[day] || []), { start: '08:00', end: '18:00' }] }));
  };

  const removeSlot = (day: string, idx: number) => {
    setScheduleForm((prev) => ({ ...prev, [day]: prev[day].filter((_, i) => i !== idx) }));
  };

  const updateSlot = (day: string, idx: number, field: 'start' | 'end', value: string) => {
    setScheduleForm((prev) => {
      const slots = [...prev[day]];
      slots[idx] = { ...slots[idx], [field]: value };
      return { ...prev, [day]: slots };
    });
  };

  const handleSaveHorarios = async () => {
    setHorariosSaving(true);
    try {
      const payload = DAY_ORDER.filter((d) => (scheduleForm[d] || []).length > 0).map((d) => ({
        dayOfWeek: d,
        timePeriods: scheduleForm[d].map((s) => ({ start: s.start, end: s.end })),
      }));
      await callMerchant({
        action: 'putOpeningHours',
        cliente_id: clienteId,
        merchantId: selectedMerchantId,
        payload,
      });
      setEditMode(false);
      await loadOpeningHours();
    } catch (e: any) {
      alert(e.message || 'Erro ao salvar horários');
    } finally {
      setHorariosSaving(false);
    }
  };

  useEffect(() => {
    loadMerchants();
  }, [loadMerchants]);

  useEffect(() => {
    if (activeTab === 'pausas' && selectedMerchantId) loadInterruptions();
    if (activeTab === 'horarios' && selectedMerchantId) loadOpeningHours();
  }, [activeTab, selectedMerchantId]);

  const isOnline =
    merchantStatus?.state === 'OPEN' ||
    merchantStatus?.status === 'OPEN' ||
    merchantStatus?.available === true ||
    merchantStatus?.open === true;

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-800">Gerenciamento de Loja — iFood</h2>
          <p className="text-sm text-slate-500">Informações, pausas e horários de funcionamento</p>
        </div>
      </div>

      {/* Merchant selector */}
      {merchants.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-3">
          <Store size={18} className="text-slate-500" />
          <label className="text-sm font-medium text-slate-700">Loja:</label>
          <select
            value={selectedMerchantId}
            onChange={(e) => {
              setSelectedMerchantId(e.target.value);
              loadMerchantDetails(e.target.value);
            }}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"
          >
            {merchants.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name || m.shortName || m.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {([
          { key: 'info', label: 'Informações da Loja', icon: Store },
          { key: 'pausas', label: 'Pausas', icon: PauseCircle },
          { key: 'horarios', label: 'Horários de Funcionamento', icon: Clock },
        ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* === TAB: INFORMAÇÕES === */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={loadMerchants}
              disabled={infoLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {infoLoading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              Atualizar
            </button>
          </div>

          {infoError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle size={16} />
              {infoError}
            </div>
          )}

          {/* Lojas vinculadas */}
          <div className="bg-white border border-slate-200 rounded-lg p-5">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Store size={16} className="text-red-500" />
              Lojas Vinculadas ({merchants.length})
            </h3>
            {merchants.length === 0 && !infoLoading && (
              <p className="text-slate-500 text-sm">Nenhuma loja encontrada.</p>
            )}
            <div className="grid gap-2">
              {merchants.map((m: any) => (
                <div
                  key={m.id}
                  onClick={() => { setSelectedMerchantId(m.id); loadMerchantDetails(m.id); }}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedMerchantId === m.id
                      ? 'border-red-300 bg-red-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="bg-red-100 p-2 rounded-lg">
                    <Store size={16} className="text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-slate-800 text-sm">{m.name || m.shortName || '—'}</p>
                    <p className="text-xs text-slate-500 font-mono">{m.id}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detalhes completos */}
          {merchantDetails && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Detalhes Completos da Loja</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                {[
                  ['Nome', merchantDetails.name || merchantDetails.shortName],
                  ['Nome completo', merchantDetails.fullName],
                  ['Merchant ID', merchantDetails.id],
                  ['CNPJ', merchantDetails.cnpj],
                  ['Tipo de culinária', Array.isArray(merchantDetails.mainCategory)
                    ? merchantDetails.mainCategory.map((c: any) => c.name || c).join(', ')
                    : merchantDetails.mainCategory],
                  ['Endereço', [
                    merchantDetails.address?.streetName,
                    merchantDetails.address?.streetNumber,
                    merchantDetails.address?.neighborhood,
                    merchantDetails.address?.city,
                    merchantDetails.address?.state,
                  ].filter(Boolean).join(', ')],
                  ['Telefone', merchantDetails.phone],
                  ['Entrega própria', merchantDetails.deliveryType === 'MERCHANT' ? 'Sim' : 'Não'],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label as string} className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                    <p className="font-medium text-slate-800">{value as string}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status / disponibilidade */}
          {merchantStatus !== null && (
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h3 className="font-semibold text-slate-800 mb-3">Disponibilidade da Loja</h3>
              <div className="flex items-center gap-3">
                {isOnline ? (
                  <CheckCircle size={24} className="text-green-500" />
                ) : (
                  <XCircle size={24} className="text-red-500" />
                )}
                <div>
                  <p className={`text-lg font-bold ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
                    {isOnline ? 'Loja Aberta' : 'Loja Fechada'}
                  </p>
                  {merchantStatus.state && (
                    <p className="text-sm text-slate-500">Estado: {merchantStatus.state}</p>
                  )}
                  {merchantStatus.message && (
                    <p className="text-sm text-slate-500">{merchantStatus.message}</p>
                  )}
                </div>
              </div>
              {/* Raw status for debugging */}
              <details className="mt-3">
                <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Ver resposta completa</summary>
                <pre className="mt-2 text-xs bg-slate-50 p-3 rounded border border-slate-200 overflow-auto max-h-48">
                  {JSON.stringify(merchantStatus, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>
      )}

      {/* === TAB: PAUSAS === */}
      {activeTab === 'pausas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Gerencie as interrupções (pausas) ativas da loja.
            </p>
            <div className="flex gap-2">
              <button
                onClick={loadInterruptions}
                disabled={pausaLoading}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {pausaLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
              <button
                onClick={() => setPausaModal(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Plus size={14} />
                Nova Pausa
              </button>
            </div>
          </div>

          {pausaError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle size={16} />
              {pausaError}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {pausaLoading && (
              <div className="p-8 text-center text-slate-400">
                <Loader2 size={24} className="animate-spin mx-auto mb-2" />
                Carregando pausas...
              </div>
            )}
            {!pausaLoading && interruptions.length === 0 && (
              <div className="p-8 text-center text-slate-400">
                <PauseCircle size={36} className="mx-auto mb-2 opacity-40" />
                <p>Nenhuma pausa ativa no momento.</p>
              </div>
            )}
            {interruptions.map((item: any) => {
              const id = item.id || item.interruptionId;
              return (
                <div key={id} className="flex items-start gap-4 p-4">
                  <div className="bg-orange-100 p-2 rounded-lg mt-0.5">
                    <PauseCircle size={18} className="text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{item.description || item.reason || 'Pausa'}</p>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-slate-500">
                      {item.start && <span>Início: {new Date(item.start).toLocaleString()}</span>}
                      {item.end && <span>Fim: {new Date(item.end).toLocaleString()}</span>}
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">{id}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteInterruption(id)}
                    disabled={deletingId === id}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    title="Remover pausa"
                  >
                    {deletingId === id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === TAB: HORÁRIOS === */}
      {activeTab === 'horarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-600">Configure os horários de funcionamento da loja.</p>
            <div className="flex gap-2">
              {!editMode && (
                <button
                  onClick={loadOpeningHours}
                  disabled={horariosLoading}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {horariosLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Atualizar
                </button>
              )}
              {!editMode && (
                <button
                  onClick={() => setEditMode(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Editar Horários
                </button>
              )}
            </div>
          </div>

          {horariosError && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle size={16} />
              {horariosError}
            </div>
          )}

          {horariosLoading && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-400">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" />
              Carregando horários...
            </div>
          )}

          {!horariosLoading && !editMode && openingHours !== null && (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
              {DAY_ORDER.map((day) => {
                const slots = scheduleForm[day] || [];
                return (
                  <div key={day} className="flex items-start gap-4 p-4">
                    <div className="w-36 flex-shrink-0">
                      <p className="text-sm font-medium text-slate-800">{DAYS_PT[day]}</p>
                    </div>
                    <div className="flex-1">
                      {slots.length === 0 ? (
                        <span className="text-sm text-slate-400">Fechado</span>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {slots.map((s, i) => (
                            <span key={i} className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full font-medium">
                              {s.start} — {s.end}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!horariosLoading && editMode && (
            <div className="space-y-3">
              {DAY_ORDER.map((day) => {
                const slots = scheduleForm[day] || [];
                return (
                  <div key={day} className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-medium text-slate-800 text-sm">{DAYS_PT[day]}</p>
                      <button
                        onClick={() => addSlot(day)}
                        className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        <Plus size={13} />
                        Adicionar horário
                      </button>
                    </div>
                    {slots.length === 0 && (
                      <p className="text-sm text-slate-400 italic">Fechado — clique em "Adicionar horário"</p>
                    )}
                    <div className="space-y-2">
                      {slots.map((slot, idx) => (
                        <div key={idx} className="flex items-center gap-3">
                          <div className="flex items-center gap-2 flex-1">
                            <input
                              type="time"
                              value={slot.start}
                              onChange={(e) => updateSlot(day, idx, 'start', e.target.value)}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-32"
                            />
                            <span className="text-slate-400 text-sm">até</span>
                            <input
                              type="time"
                              value={slot.end}
                              onChange={(e) => updateSlot(day, idx, 'end', e.target.value)}
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-32"
                            />
                          </div>
                          <button
                            onClick={() => removeSlot(day, idx)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setEditMode(false); initScheduleForm(openingHours); }}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveHorarios}
                  disabled={horariosSaving}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {horariosSaving && <Loader2 size={14} className="animate-spin" />}
                  Salvar Horários
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de nova pausa */}
      <Modal
        open={pausaModal}
        onClose={() => setPausaModal(false)}
        title="Nova Pausa (Interrupção)"
        hideFooter
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Descrição / Motivo</label>
            <input
              type="text"
              value={pausaForm.description}
              onChange={(e) => setPausaForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Ex: Manutenção do equipamento"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Início</label>
            <input
              type="datetime-local"
              value={pausaForm.start}
              onChange={(e) => setPausaForm((f) => ({ ...f, start: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Fim</label>
            <input
              type="datetime-local"
              value={pausaForm.end}
              onChange={(e) => setPausaForm((f) => ({ ...f, end: e.target.value }))}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setPausaModal(false)}
              className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateInterruption}
              disabled={pausaSaving}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {pausaSaving && <Loader2 size={14} className="animate-spin" />}
              Criar Pausa
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
