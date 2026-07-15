import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type Nota = any;
type Cliente = Database['public']['Tables']['clientes']['Row'];

export function EmissaoNotasPanel() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ cliente_id: '', descricao: '', valor: '' });
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [certFileName, setCertFileName] = useState('');
  const [certBase64, setCertBase64] = useState<string>('');
  const [certPassword, setCertPassword] = useState('');
  const [certStatus, setCertStatus] = useState<'ausente' | 'configurado'>('ausente');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoadingList(true);
    setError(null);
    try {
      const p = Promise.all([
        supabase.from('clientes').select('id, nome_completo').order('nome_completo'),
        supabase.from('notas_fiscais').select('*').order('created_at', { ascending: false }).limit(200),
      ]);
      const result = await new Promise<[
        { data?: Cliente[]; error?: { message?: string } },
        { data?: Nota[]; error?: { message?: string } }
      ]>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Tempo excedido na consulta')), 8000);
        p.then(
          (v) => { clearTimeout(t); resolve(v as unknown as [
            { data?: Cliente[]; error?: { message?: string } },
            { data?: Nota[]; error?: { message?: string } }
          ]); },
          (err) => { clearTimeout(t); reject(err); }
        );
      });
      const [cRes, nRes] = result;
      if (cRes.error?.message) setError(cRes.error.message);
      if (nRes.error?.message) setError(nRes.error.message);
      setClientes((cRes.data || []) as Cliente[]);
      setNotas((nRes.data || []) as Nota[]);
      try {
        const { data: session } = await supabase.auth.getSession();
        const uid = session.session?.user?.id;
        if (uid) {
          const { data: cfg } = await supabase.from('config_fiscal').select('id').eq('user_id', uid).maybeSingle();
          setCertStatus(cfg ? 'configurado' : 'ausente');
        }
      } catch (e) { void e; }
    } catch {
      try {
        const [cR, nR] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/clientes?select=id,nome_completo&order=nome_completo`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
          fetch(`${SUPABASE_URL}/rest/v1/notas_fiscais?select=*&order=created_at.desc&limit=200`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }),
        ]);
        if (cR.ok) setClientes(await cR.json());
        if (nR.ok) setNotas(await nR.json());
        if (!cR.ok || !nR.ok) {
          const msg = `Falha ${(cR.ok ? '' : cR.status)} ${(nR.ok ? '' : nR.status)}`.trim();
          if (msg) setError(msg);
        } else {
          setError(null);
        }
      } catch (e2) {
        const msg = (e2 as { message?: string })?.message || 'Erro ao carregar notas';
        setError(msg);
      }
    } finally {
      setLoadingList(false);
    }
  };

  const handleEmitir = async () => {
    if (!form.cliente_id || !form.valor || !form.descricao) return;
    setLoadingSubmit(true);
    setError(null);
    setResultMsg(null);
    try {
      const payload = { cliente_id: form.cliente_id, descricao: form.descricao, valor: Number(form.valor) };
      const { data, error: fnError } = await supabase.functions.invoke('emitir_nota', { body: payload });
      void data;
      if (fnError) throw fnError;
      setResultMsg('Nota emitida com sucesso');
      setForm({ cliente_id: '', descricao: '', valor: '' });
      await fetchAll();
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || 'Falha ao emitir nota';
      setError(msg);
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Emissão de notas fiscais</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      {resultMsg && <div className="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{resultMsg}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-slate-700">Certificado digital A1: {certStatus === 'configurado' ? 'configurado' : 'ausente'}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Arquivo .pfx</label>
            <input
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) { setCertFileName(''); setCertBase64(''); return; }
                setCertFileName(f.name);
                const reader = new FileReader();
                reader.onload = () => {
                  const arr = new Uint8Array(reader.result as ArrayBuffer);
                  let binary = '';
                  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i]);
                  const b64 = btoa(binary);
                  setCertBase64(b64);
                };
                reader.readAsArrayBuffer(f);
              }}
            />
            {certFileName && <div className="mt-1 text-xs text-slate-600">{certFileName}</div>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Senha do certificado</label>
            <input type="password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
        </div>
        <div className="mt-4">
          <button
            onClick={async () => {
              if (!certBase64 || !certPassword) { setError('Selecione o arquivo e informe a senha'); return; }
              setLoadingSubmit(true);
              setError(null);
              const { data: session } = await supabase.auth.getSession();
              const uid = session.session?.user?.id;
              if (!uid) { setError('Usuário não autenticado'); setLoadingSubmit(false); return; }
              const res = await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown, opts?: unknown) => Promise<unknown> } })
                .from('config_fiscal')
                .upsert({ user_id: uid, cert_pfx_base64: certBase64, cert_password: certPassword }, { onConflict: 'user_id' });
              const r = res as unknown as { error?: { message?: string } };
              if (r.error?.message) setError(r.error.message);
              else {
                setResultMsg('Certificado configurado com sucesso');
                setCertStatus('configurado');
                setCertFileName('');
                setCertBase64('');
                setCertPassword('');
              }
              setLoadingSubmit(false);
            }}
            disabled={loadingSubmit}
            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50"
          >
            {loadingSubmit ? 'Salvando...' : 'Salvar certificado'}
          </button>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Cliente</option>
            {clientes.map((c) => (<option key={c.id} value={c.id}>{c.nome_completo}</option>))}
          </select>
          <input placeholder="Valor" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Descrição" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-2" />
        </div>
        <div className="mt-4">
          <button onClick={handleEmitir} disabled={loadingSubmit} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loadingSubmit ? 'Emitindo...' : 'Emitir nota fiscal'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Notas emitidas</div>
        {loadingList ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : notas.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhuma nota emitida</div>
        ) : (
          <div className="divide-y">
            {notas.map((n) => (
              <div key={n.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{n.cliente_id}</div>
                  <div className="text-sm text-slate-600">{[n.numero ? `NF ${n.numero}` : '', n.serie ? `série ${n.serie}` : '', n.valor != null ? `R$ ${n.valor}` : '', n.protocolo ? `prot ${n.protocolo}` : '', n.chave_nfe ? `ch ${n.chave_nfe}` : '', n.ambiente || '', n.status || ''].filter(Boolean).join(' • ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
