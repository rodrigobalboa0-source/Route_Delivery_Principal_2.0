import { useEffect, useRef, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { Modal } from '../Modal';
import { AccountUnderAnalysis } from '../AccountUnderAnalysis';
import { Copy, Check, X } from 'lucide-react';
import type { Database } from '../../lib/database.types';

type Entregador = Database['public']['Tables']['entregadores']['Row'];
type Cliente = Database['public']['Tables']['clientes']['Row'];
type CSVRow = {
  nome_completo?: string
  cpf?: string
  rg?: string
  data_nascimento?: string
  telefone?: string
  email?: string
  veiculo_tipo?: 'moto' | 'bike' | 'carro' | ''
  veiculo_modelo?: string
  veiculo_placa?: string
  veiculo_ano?: string
  cnh_valida?: string | boolean
  tipo_entrega?: 'proprio' | 'terceirizado' | 'parceiro' | ''
  status?: 'ativo' | 'inativo' | 'em_analise' | ''
  cep?: string
  rua?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
};

const sbInsert = (table: string, values: unknown) => (supabase as unknown as { from: (rel: string) => { insert: (vals: unknown) => { select: () => { single: () => Promise<unknown> } } } }).from(table).insert(values).select().single();

export function EntregadoresPanel({ mode = 'admin', initialEditId }: { mode?: 'admin' | 'public', initialEditId?: string }) {
  const [entregadores, setEntregadores] = useState<Entregador[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSignupAttemptAtRef = useRef(0);
  const [editing, setEditing] = useState<Entregador | null>(null);
  const [showForm, setShowForm] = useState(mode === 'public');
  const [expandedStatus, setExpandedStatus] = useState<Record<string, boolean>>({
    em_analise: false,
    ativo: false,
    inativo: false
  });
  const toggleStatus = (st: string) => {
    setExpandedStatus(prev => ({ ...prev, [st]: !prev[st] }));
  };
  const Chevron = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    veiculo_tipo: '',
    veiculo_modelo: '',
    veiculo_placa: '',
    veiculo_ano: '',
    cnh_valida: false,
    tipo_entrega: '',
    taxa_entrega: '',
    status: 'inativo',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    restricao_clientes_modo: 'todos',
    clientes_permitidos: [] as string[],
    nova_senha: '',
  });
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [comprovanteFile, setComprovanteFile] = useState<File | null>(null);
  const [motoDocFile, setMotoDocFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState('');
  const [cnhPreview, setCnhPreview] = useState('');
  const [comprovantePreview, setComprovantePreview] = useState('');
  const [motoDocPreview, setMotoDocPreview] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRows, setCsvRows] = useState<CSVRow[]>([]);
  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    senha: '',
    veiculo_tipo: '',
    veiculo_modelo: '',
    veiculo_placa: '',
    veiculo_ano: '',
    cnh_valida: false,
    tipo_entrega: '',
    status: 'em_analise',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    foto_url: '',
    foto_base64: '',
    cnh_foto_url: '',
    cnh_foto_base64: '',
    comprovante_residencia_url: '',
    comprovante_residencia_base64: '',
    documento_veiculo_url: '',
    documento_veiculo_base64: '',
    restricao_clientes_modo: 'todos',
    clientes_permitidos: [] as string[],
  });
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);
  const [editCnhFile, setEditCnhFile] = useState<File | null>(null);
  const [editComprovanteFile, setEditComprovanteFile] = useState<File | null>(null);
  const [editMotoDocFile, setEditMotoDocFile] = useState<File | null>(null);
  const [editFotoPreview, setEditFotoPreview] = useState('');
  const [editCnhPreview, setEditCnhPreview] = useState('');
  const [editComprovantePreview, setEditComprovantePreview] = useState('');
  const [editMotoDocPreview, setEditMotoDocPreview] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [selectedBankData, setSelectedBankData] = useState<any | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'public') {
      fetchEntregadores();
      fetchClientes();
    }
  }, []);

  useEffect(() => {
    if (initialEditId && entregadores.length > 0) {
      const target = entregadores.find(e => e.id === initialEditId);
      if (target) {
        openEdit(target);
      }
    }
  }, [initialEditId, entregadores]);

  const fetchClientes = async () => {
    const { data } = await supabase.from('clientes').select('*').order('nome_completo');
    setClientes((data || []) as Cliente[]);
  };

  const fetchEntregadores = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('entregadores').select('*').order('nome_completo');
    if (error) setError(error.message);
    const list = (data || []) as Entregador[];
    const byEmail = new Map<string, Entregador>();
    for (const e of list) {
      const key = ((e.email || '').trim().toLowerCase()) || e.id;
      if (!byEmail.has(key)) byEmail.set(key, e);
    }
    let dedup = Array.from(byEmail.values());
    try {
      const { data: admins } = await supabase.from('contas_gerenciais').select('email_acesso');
      const adminSet = new Set((admins || []).map((a: { email_acesso?: string | null }) => (a.email_acesso || '').trim().toLowerCase()));
      dedup = dedup.filter((e) => !adminSet.has(((e.email || '').trim().toLowerCase())));
      const { data: usersAdmin } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (c: string, v: string) => Promise<{ data?: { email?: string; role?: string }[] }> } } }).from('users').select('email, role').eq('role', 'operador');
      const opSet = new Set(((usersAdmin || []) as { email?: string; role?: string }[]).map((u) => (u.email || '').trim().toLowerCase()));
      dedup = dedup.filter((e) => !opSet.has(((e.email || '').trim().toLowerCase())));
    } catch { /* ignore */ }
    setEntregadores(dedup);
    setLoading(false);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    const emailKey = (form.email || '').trim().toLowerCase();
    if (mode !== 'public' && emailKey) {
      const { data: exists, error: existsErr } = await supabase.from('entregadores').select('id').ilike('email', emailKey).maybeSingle();
      if (!existsErr && (exists as { id?: string } | null)?.id) {
        setError('Já existe entregador com este e-mail');
        setLoading(false);
        return;
      }
      const { data: admin, error: adminErr } = await supabase.from('contas_gerenciais').select('id').ilike('email_acesso', emailKey).maybeSingle();
      if (!adminErr && (admin as { id?: string } | null)?.id) {
        setError('E-mail pertence a uma conta administrativa');
        setLoading(false);
        return;
      }
      const { data: userAdmin } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { ilike: (c: string, v: string) => { eq: (c: string, v: string) => Promise<{ data?: { id?: string }[] }> } } } }).from('users').select('id').ilike('email', emailKey).eq('role', 'operador');
      if ((userAdmin || []).length > 0) {
        setError('E-mail pertence a uma conta administrativa');
        setLoading(false);
        return;
      }
    }
    let authUserId: string | undefined;
    try {
      const shouldRegisterAuth = Boolean(emailKey) && Boolean((form.senha || '').trim());
      if (shouldRegisterAuth) {
        const now = Date.now();
        if (now - lastSignupAttemptAtRef.current < 15000) {
          setError('Aguarde 15 segundos para tentar novamente.');
          setLoading(false);
          return;
        }
        lastSignupAttemptAtRef.current = now;
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: emailKey,
          password: (form.senha || '').trim(),
          options: {
            data: {
              full_name: form.nome_completo,
              role: 'entregador',
            },
          },
        });
        if (signUpError) {
          let msg = signUpError.message;
          if (msg.includes('over_email_send_rate_limit')) {
            msg = 'Muitas tentativas de cadastro. Por favor, aguarde alguns minutos e tente novamente.';
          } else if (msg.toLowerCase().includes('only request this after 15 seconds')) {
            msg = 'Aguarde 15 segundos para tentar novamente.';
          } else if (msg.includes('User already registered')) {
            msg = 'E-mail já cadastrado.';
          }
          setError(msg);
          setLoading(false);
          return;
        }
        
        if (signUpData?.user?.id) {
           authUserId = signUpData.user.id;
        }
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      if (msg) setError(msg);
      setLoading(false);
      return;
    }
    const insertValues: Record<string, unknown> = {
      ...(authUserId ? { id: authUserId } : {}),
      nome_completo: form.nome_completo,
      cpf: form.cpf || null,
      rg: form.rg || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: emailKey || null,
      cep: form.cep || null,
      rua: form.rua || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      veiculo_tipo: (form.veiculo_tipo || null) as Entregador['veiculo_tipo'],
      veiculo_modelo: form.veiculo_modelo || null,
      veiculo_placa: form.veiculo_placa || null,
      veiculo_ano: form.veiculo_ano ? Number(form.veiculo_ano) : null,
      cnh_valida: form.cnh_valida,
      tipo_entrega: (form.tipo_entrega || null) as Entregador['tipo_entrega'],
      status: form.status as Entregador['status'],
      restricao_clientes_modo: form.restricao_clientes_modo as 'todos' | 'selecionados',
      clientes_permitidos: form.clientes_permitidos,
    };
    if (mode === 'public') {
      insertValues.foto_base64 = fotoPreview || null;
      insertValues.cnh_foto_base64 = cnhPreview || null;
      insertValues.comprovante_residencia_base64 = comprovantePreview || null;
      insertValues.documento_veiculo_base64 = motoDocPreview || null;

      try {
        const { error } = await supabase.rpc('cadastrar_entregador_v2', {
          payload: insertValues
        });

        if (error) {
          console.error('RPC Error:', error);
          let msg = error.message;
          if (msg.includes('row-level security policy')) {
            msg = 'Erro de permissão ao salvar dados. Tente novamente ou contate o suporte.';
          }
          setError(msg);
          setLoading(false);
          return;
        }

        setRegistrationSuccess(true);
        setLoading(false);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha ao salvar cadastro';
        setError(msg);
        setLoading(false);
        return;
      }
    }

    const res = await sbInsert('entregadores', insertValues);
    const r = res as unknown as { data?: { id?: string }; error?: { message?: string } };
    if (r.error?.message) {
      let msg = r.error.message;
      if (msg.includes('row-level security policy')) {
        msg = 'Erro de permissão ao salvar dados. Tente novamente ou contate o suporte.';
      }
      setError(msg);
      setLoading(false);
      return;
    }
    const idNew = (r.data?.id || '') as string;
    if (idNew) {
      let finalFotoUrl = '';
      let finalFotoBase64 = '';
      let finalCnhUrl = '';
      let finalCnhBase64 = '';
      let finalCompUrl = '';
      let finalCompBase64 = '';
      let finalMotoUrl = '';
      let finalMotoBase64 = '';

      if (fotoFile) {
        try {
          const name = `entregadores/${idNew}/foto-${Date.now()}-${(fotoFile.name || 'foto').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, fotoFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalFotoUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
          } else {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalFotoBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(fotoFile);
            });
          }
        } catch {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalFotoBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(fotoFile);
            });
        }
      }

      if (cnhFile) {
        try {
          const name = `entregadores/${idNew}/cnh-${Date.now()}-${(cnhFile.name || 'cnh').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, cnhFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalCnhUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
          } else {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalCnhBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(cnhFile);
            });
          }
        } catch {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalCnhBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(cnhFile);
            });
        }
      }

      if (comprovanteFile) {
        try {
          const name = `entregadores/${idNew}/comprovante-${Date.now()}-${(comprovanteFile.name || 'comprovante').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, comprovanteFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalCompUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
          } else {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalCompBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(comprovanteFile);
            });
          }
        } catch {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalCompBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(comprovanteFile);
            });
        }
      }

      if (motoDocFile) {
        try {
          const name = `entregadores/${idNew}/motodoc-${Date.now()}-${(motoDocFile.name || 'motodoc').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, motoDocFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalMotoUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
          } else {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalMotoBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(motoDocFile);
            });
          }
        } catch {
            const reader = new FileReader();
            await new Promise((resolve) => {
                reader.onload = () => { finalMotoBase64 = String(reader.result || ''); resolve(true); };
                reader.readAsDataURL(motoDocFile);
            });
        }
      }

      await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } }).from('entregadores').update({
        foto_url: finalFotoUrl || null,
        foto_base64: finalFotoBase64 || null,
        cnh_foto_url: finalCnhUrl || null,
        cnh_foto_base64: finalCnhBase64 || null,
        comprovante_residencia_url: finalCompUrl || null,
        comprovante_residencia_base64: finalCompBase64 || null,
        documento_veiculo_url: finalMotoUrl || null,
        documento_veiculo_base64: finalMotoBase64 || null,
      }).eq('id', idNew);
    }

    setForm({ nome_completo: '', cpf: '', rg: '', data_nascimento: '', telefone: '', email: '', senha: '', veiculo_tipo: '', veiculo_modelo: '', veiculo_placa: '', veiculo_ano: '', cnh_valida: false, tipo_entrega: '', taxa_entrega: '', status: 'inativo', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', foto_url: '', foto_base64: '', cnh_foto_url: '', cnh_foto_base64: '', comprovante_residencia_url: '', comprovante_residencia_base64: '', documento_veiculo_url: '', documento_veiculo_base64: '', restricao_clientes_modo: 'todos', clientes_permitidos: [] });
    setFotoFile(null);
    setCnhFile(null);
    setComprovanteFile(null);
    setMotoDocFile(null);
    setFotoPreview('');
    setCnhPreview('');
    setComprovantePreview('');
    setMotoDocPreview('');
    await fetchEntregadores();
  };

  const handleDelete = async (id: string) => {
    try {
      const { data: row } = await supabase.from('entregadores').select('email').eq('id', id).maybeSingle();
      const email = ((row as { email?: string } | null)?.email || '').trim().toLowerCase();
      await supabase.from('entregadores').delete().eq('id', id);
      if (email) {
        await (supabase as unknown as { from: (t: string) => { delete: () => { ilike: (c: string, v: string) => Promise<unknown> } } })
          .from('users')
          .delete()
          .ilike('email', email);
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/delete-auth-user-by-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ email }),
          });
        } catch (e) { void e; }
        try {
          const { data: session } = await supabase.auth.getSession();
          const currentEmail = (session.session?.user?.email || '').trim().toLowerCase();
          if (currentEmail && currentEmail === email) {
            await supabase.auth.signOut();
            try { localStorage.removeItem('entregador_context'); } catch (e) { void e; }
          }
        } catch (e) { void e; }
      }
    } finally {
      await fetchEntregadores();
    }
  };

  const openEdit = (c: Entregador) => {
    setEditing(c);
    setEditFotoFile(null);
    setEditCnhFile(null);
    setEditComprovanteFile(null);
    setEditMotoDocFile(null);
    setEditForm({
      nome_completo: c.nome_completo,
      cpf: c.cpf || '',
      rg: c.rg || '',
      data_nascimento: c.data_nascimento || '',
      telefone: c.telefone || '',
      email: c.email || '',
      veiculo_tipo: c.veiculo_tipo || '',
      veiculo_modelo: c.veiculo_modelo || '',
      veiculo_placa: c.veiculo_placa || '',
      veiculo_ano: c.veiculo_ano != null ? String(c.veiculo_ano) : '',
      cnh_valida: Boolean(c.cnh_valida),
      tipo_entrega: c.tipo_entrega || '',
      taxa_entrega: c.taxa_entrega != null ? String(c.taxa_entrega) : '',
      status: c.status,
      cep: (c as any).cep || '',
      rua: (c as any).rua || '',
      numero: (c as any).numero || '',
      complemento: (c as any).complemento || '',
      bairro: (c as any).bairro || '',
      cidade: (c as any).cidade || '',
      foto_url: (c as any).foto_url || '',
      foto_base64: (c as any).foto_base64 || '',
      cnh_foto_url: (c as any).cnh_foto_url || '',
      cnh_foto_base64: (c as any).cnh_foto_base64 || '',
      comprovante_residencia_url: (c as any).comprovante_residencia_url || '',
      comprovante_residencia_base64: (c as any).comprovante_residencia_base64 || '',
      documento_veiculo_url: (c as any).documento_veiculo_url || '',
      documento_veiculo_base64: (c as any).documento_veiculo_base64 || '',
      restricao_clientes_modo: (c as any).restricao_clientes_modo || 'todos',
      clientes_permitidos: (c as any).clientes_permitidos ? (c as any).clientes_permitidos : [],
      nova_senha: '',
    } as any);
    setEditFotoPreview((c as unknown as { foto_url?: string; foto_base64?: string }).foto_url || (c as unknown as { foto_base64?: string }).foto_base64 || '');
    setEditCnhPreview((c as unknown as { cnh_foto_url?: string; cnh_foto_base64?: string }).cnh_foto_url || (c as unknown as { cnh_foto_base64?: string }).cnh_foto_base64 || '');
    setEditComprovantePreview((c as unknown as { comprovante_residencia_url?: string; comprovante_residencia_base64?: string }).comprovante_residencia_url || (c as unknown as { comprovante_residencia_base64?: string }).comprovante_residencia_base64 || '');
    setEditMotoDocPreview((c as unknown as { documento_veiculo_url?: string; documento_veiculo_base64?: string }).documento_veiculo_url || (c as unknown as { documento_veiculo_base64?: string }).documento_veiculo_base64 || '');
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);

    let finalFotoUrl = (editForm as any).foto_url;
    let finalFotoBase64 = (editForm as any).foto_base64;
    let finalCnhUrl = (editForm as any).cnh_foto_url;
    let finalCnhBase64 = (editForm as any).cnh_foto_base64;
    let finalCompUrl = (editForm as any).comprovante_residencia_url;
    let finalCompBase64 = (editForm as any).comprovante_residencia_base64;
    let finalMotoUrl = (editForm as any).documento_veiculo_url;
    let finalMotoBase64 = (editForm as any).documento_veiculo_base64;

    if (editing?.id) {
      if ((editForm as any).nova_senha) {
        try {
          const { error: pwdError } = await supabase.rpc('admin_update_password', {
            target_user_id: editing.id,
            new_password: ((editForm as any).nova_senha || '').trim(),
            new_email: (editForm.email || '').trim()
          });
          if (pwdError) {
             console.error('Password update error:', pwdError);
             setError('Erro ao atualizar senha. Verifique se a função admin_update_password existe.');
          }
        } catch (e) {
          console.error(e);
        }
      }

      
      try {
         await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
            .from('users')
            .upsert({ 
               id: editing.id, 
               email: editForm.email, 
               full_name: editForm.nome_completo, 
               role: 'entregador' 
            });
      } catch (e) { console.error('Users sync update error', e); }

      if (editFotoFile) {
        try {
          const name = `entregadores/${editing.id}/foto-${Date.now()}-${(editFotoFile.name || 'foto').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, editFotoFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalFotoUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
            finalFotoBase64 = null;
          } else {
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalFotoBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editFotoFile);
             });
          }
        } catch (e) { 
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalFotoBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editFotoFile);
             });
        }
      }
      if (editCnhFile) {
        try {
          const name = `entregadores/${editing.id}/cnh-${Date.now()}-${(editCnhFile.name || 'cnh').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, editCnhFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalCnhUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
            finalCnhBase64 = null;
          } else {
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalCnhBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editCnhFile);
             });
          }
        } catch (e) { 
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalCnhBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editCnhFile);
             });
        }
      }
      if (editComprovanteFile) {
        try {
          const name = `entregadores/${editing.id}/comprovante-${Date.now()}-${(editComprovanteFile.name || 'comprovante').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, editComprovanteFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalCompUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
            finalCompBase64 = null;
          } else {
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalCompBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editComprovanteFile);
             });
          }
        } catch (e) { 
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalCompBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editComprovanteFile);
             });
        }
      }
      if (editMotoDocFile) {
        try {
          const name = `entregadores/${editing.id}/motodoc-${Date.now()}-${(editMotoDocFile.name || 'motodoc').replace(/[^a-zA-Z0-9_.-]/g, '')}`;
          const up = await (supabase as unknown as { storage: { from: (b: string) => { upload: (p: string, f: File, o?: unknown) => Promise<{ data?: { path?: string }; error?: { message?: string } }>; getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').upload(name, editMotoDocFile, { upsert: true });
          if (!up.error && up.data?.path) {
            finalMotoUrl = (supabase as unknown as { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }).storage.from('images').getPublicUrl(up.data.path).data.publicUrl;
            finalMotoBase64 = null;
          } else {
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalMotoBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editMotoDocFile);
             });
          }
        } catch (e) { 
             const reader = new FileReader();
             await new Promise((resolve) => {
                 reader.onload = () => { finalMotoBase64 = String(reader.result || ''); resolve(true); };
                 reader.readAsDataURL(editMotoDocFile);
             });
        }
      }
    }
    const res = await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: unknown) => Promise<unknown> } } })
      .from('entregadores')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf || null,
        rg: editForm.rg || null,
        data_nascimento: editForm.data_nascimento || null,
        telefone: editForm.telefone || null,
        email: editForm.email || null,
        cep: editForm.cep || null,
        rua: editForm.rua || null,
        numero: editForm.numero || null,
        complemento: editForm.complemento || null,
        bairro: editForm.bairro || null,
        cidade: editForm.cidade || null,
        veiculo_tipo: (editForm.veiculo_tipo || null) as Entregador['veiculo_tipo'],
        veiculo_modelo: editForm.veiculo_modelo || null,
        veiculo_placa: editForm.veiculo_placa || null,
        veiculo_ano: editForm.veiculo_ano ? Number(editForm.veiculo_ano) : null,
        cnh_valida: editForm.cnh_valida,
        tipo_entrega: (editForm.tipo_entrega || null) as Entregador['tipo_entrega'],
        taxa_entrega: editForm.taxa_entrega ? Number(editForm.taxa_entrega) : null,
        status: editForm.status as Entregador['status'],
        foto_url: finalFotoUrl || null,
        foto_base64: finalFotoBase64 || null,
        cnh_foto_url: finalCnhUrl || null,
        cnh_foto_base64: finalCnhBase64 || null,
        comprovante_residencia_url: finalCompUrl || null,
        comprovante_residencia_base64: finalCompBase64 || null,
        documento_veiculo_url: finalMotoUrl || null,
        documento_veiculo_base64: finalMotoBase64 || null,
        restricao_clientes_modo: (editForm as any).restricao_clientes_modo || 'todos',
        clientes_permitidos: (editForm as any).clientes_permitidos || [],
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    setEditing(null);
    setLoading(false);
    await fetchEntregadores();
  };

  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return null;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) return null;
      return data;
    } catch {
      return null;
    }
  };

  const handleCepBlur = async (cep: string) => {
    const data = await fetchAddressByCep(cep);
    if (data) {
      setForm((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
        
      }));
    }
  };

  const handleEditCepBlur = async (cep: string) => {
    const data = await fetchAddressByCep(cep);
    if (data) {
      setEditForm((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
      }));
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (registrationSuccess) {
    return (
      <div className="p-6 bg-white rounded shadow">
        <AccountUnderAnalysis onBack={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <style>{`
        .fade-slide-in { animation: fadeSlideIn .25s ease-out; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Entregadores</h2>
      {mode !== 'public' && (
        <button onClick={() => setShowForm((v) => !v)} className="w-full mb-3 flex items-center justify-between px-4 py-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500">
          <span className="text-sm font-semibold">{showForm ? 'Fechar cadastro de entregador' : 'Cadastrar entregador'}</span>
          <span className="opacity-90"><Chevron open={showForm} /></span>
        </button>
      )}
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      {showForm && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 fade-slide-in shadow-sm">
        {mode === 'public' ? (
          <div className="md:flex md:gap-8">
            <div className="md:w-48 flex flex-col items-center gap-3">
              <div className="w-28 h-28 rounded-full bg-slate-100 border border-slate-300 overflow-hidden">
                {fotoPreview ? <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <label htmlFor="upload_foto_pub" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
              <input id="upload_foto_pub" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setFotoFile(f); if (f) { const r = new FileReader(); r.onload = () => setFotoPreview(String(r.result || '')); r.readAsDataURL(f); } else { setFotoPreview(''); } }} className="hidden" />
              <div className="text-[11px] text-slate-500 mt-1">{fotoFile ? fotoFile.name : 'Nenhum arquivo escolhido'}</div>
              <div className="text-[11px] text-slate-500">Foto do entregador</div>
            </div>
            <div className="md:flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <input placeholder="Nome completo" value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="RG" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input type="date" placeholder="Nascimento" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} onBlur={(e) => handleCepBlur(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Rua" value={form.rua} onChange={(e) => setForm({ ...form, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input type="password" placeholder="Senha (para criar acesso)" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <select value={form.veiculo_tipo} onChange={(e) => setForm({ ...form, veiculo_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
                <option value="">Tipo de veículo</option>
                <option value="moto">Moto</option>
                <option value="bike">Bike</option>
                <option value="carro">Carro</option>
              </select>
              <input placeholder="Modelo" value={form.veiculo_modelo} onChange={(e) => setForm({ ...form, veiculo_modelo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Placa" value={form.veiculo_placa} onChange={(e) => setForm({ ...form, veiculo_placa: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
              <input placeholder="Ano" value={form.veiculo_ano} onChange={(e) => setForm({ ...form, veiculo_ano: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />

            </div>
            <div className="md:w-48 flex flex-col items-center gap-3 mt-6 md:mt-0">
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                {cnhPreview ? <img src={cnhPreview} alt="CNH" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <label htmlFor="upload_cnh_pub" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
              <input id="upload_cnh_pub" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setCnhFile(f); if (f) { const r = new FileReader(); r.onload = () => setCnhPreview(String(r.result || '')); r.readAsDataURL(f); } else { setCnhPreview(''); } }} className="hidden" />
              <div className="text-[11px] text-slate-500 mt-1">{cnhFile ? cnhFile.name : 'Nenhum arquivo escolhido'}</div>
              <div className="text-[11px] text-slate-500">Foto da CNH</div>
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                {comprovantePreview ? <img src={comprovantePreview} alt="Comprovante" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <label htmlFor="upload_comp_pub" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
              <input id="upload_comp_pub" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setComprovanteFile(f); if (f) { const r = new FileReader(); r.onload = () => setComprovantePreview(String(r.result || '')); r.readAsDataURL(f); } else { setComprovantePreview(''); } }} className="hidden" />
              <div className="text-[11px] text-slate-500 mt-1">{comprovanteFile ? comprovanteFile.name : 'Nenhum arquivo escolhido'}</div>
              <div className="text-[11px] text-slate-500">Comprovante de residência</div>
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                {motoDocPreview ? <img src={motoDocPreview} alt="Doc Moto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <label htmlFor="upload_moto_pub" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
              <input id="upload_moto_pub" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setMotoDocFile(f); if (f) { const r = new FileReader(); r.onload = () => setMotoDocPreview(String(r.result || '')); r.readAsDataURL(f); } else { setMotoDocPreview(''); } }} className="hidden" />
              <div className="text-[11px] text-slate-500 mt-1">{motoDocFile ? motoDocFile.name : 'Nenhum arquivo escolhido'}</div>
              <div className="text-[11px] text-slate-500">Documento da Moto</div>
            </div>
          </div>
        ) : (
          <>
            <div className="md:flex md:gap-8">
              <div className="md:w-48 flex flex-col items-center">
                <div className="w-28 h-28 rounded-full bg-slate-100 border border-slate-300 overflow-hidden mb-2">
                  {fotoPreview ? <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                </div>
                <label htmlFor="upload_foto_admin" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
                <input id="upload_foto_admin" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setFotoFile(f); if (f) { const r = new FileReader(); r.onload = () => setFotoPreview(String(r.result || '')); r.readAsDataURL(f); } else { setFotoPreview(''); } }} className="hidden" />
                <div className="text-[11px] text-slate-500 mt-1">{fotoFile ? fotoFile.name : 'Nenhum arquivo escolhido'}</div>
                <div className="text-[11px] text-slate-500">Foto do entregador</div>
              </div>
              <div className="md:flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                <input placeholder="Nome completo" value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="CPF" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="RG" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input type="date" placeholder="Nascimento" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input type="email" placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="CEP" value={form.cep} onChange={(e) => setForm({ ...form, cep: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Rua" value={form.rua} onChange={(e) => setForm({ ...form, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Número" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Complemento" value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input type="password" placeholder="Senha (para criar acesso)" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <select value={form.veiculo_tipo} onChange={(e) => setForm({ ...form, veiculo_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
                  <option value="">Tipo de veículo</option>
                  <option value="moto">Moto</option>
                  <option value="bike">Bike</option>
                  <option value="carro">Carro</option>
                </select>
                <input placeholder="Modelo" value={form.veiculo_modelo} onChange={(e) => setForm({ ...form, veiculo_modelo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Placa" value={form.veiculo_placa} onChange={(e) => setForm({ ...form, veiculo_placa: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <input placeholder="Ano" value={form.veiculo_ano} onChange={(e) => setForm({ ...form, veiculo_ano: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <div className="flex items-center gap-2">
                  <input id="cnh" type="checkbox" checked={form.cnh_valida} onChange={(e) => setForm({ ...form, cnh_valida: e.target.checked })} />
                  <label htmlFor="cnh" className="text-sm text-slate-700">CNH válida</label>
                </div>
                <select value={form.tipo_entrega} onChange={(e) => setForm({ ...form, tipo_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
                  <option value="">Tipo de entrega</option>
                  <option value="proprio">Próprio</option>
                  <option value="terceirizado">Terceirizado</option>
                  <option value="parceiro">Parceiro</option>
                </select>
                <input placeholder="Taxa de entrega" value={form.taxa_entrega} onChange={(e) => setForm({ ...form, taxa_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
                <div className="md:col-span-2 border border-slate-200 rounded p-3 mt-2 bg-slate-50">
                  <label className="text-sm font-semibold text-slate-700 block mb-2">Permissão de Coleta</label>
                  <div className="flex items-center gap-4 mb-3">
                     <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="radio" name="admin_restricao_clientes_modo" checked={form.restricao_clientes_modo === 'todos'} onChange={() => setForm({ ...form, restricao_clientes_modo: 'todos' })} className="text-sky-600 focus:ring-sky-500" />
                        Todos os clientes
                     </label>
                     <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                        <input type="radio" name="admin_restricao_clientes_modo" checked={form.restricao_clientes_modo === 'selecionados'} onChange={() => setForm({ ...form, restricao_clientes_modo: 'selecionados' })} className="text-sky-600 focus:ring-sky-500" />
                        Somente selecionados
                     </label>
                  </div>
                  {form.restricao_clientes_modo === 'selecionados' && (
                    <div className="max-h-60 overflow-y-auto border border-slate-300 rounded bg-white p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {clientes.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 p-1 rounded">
                          <input 
                            type="checkbox" 
                            checked={(form.clientes_permitidos || []).includes(c.id)}
                            onChange={(e) => {
                               const checked = e.target.checked;
                               setForm(prev => {
                                 const current = prev.clientes_permitidos || [];
                                 return {
                                   ...prev,
                                   clientes_permitidos: checked 
                                     ? [...current, c.id]
                                     : current.filter(id => id !== c.id)
                                 };
                               });
                            }}
                            className="rounded text-sky-600 focus:ring-sky-500"
                          />
                          <span className="truncate" title={c.nome_completo}>{c.nome_completo}</span>
                        </label>
                      ))}
                      {clientes.length === 0 && <div className="text-slate-400 text-xs col-span-full">Nenhum cliente ativo encontrado.</div>}
                    </div>
                  )}
                </div>
              </div>
              <div className="md:w-48 flex flex-col items-center gap-3 mt-6 md:mt-0">
                <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                  {cnhPreview ? <img src={cnhPreview} alt="CNH" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                </div>
                <label htmlFor="upload_cnh_admin" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
                <input id="upload_cnh_admin" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setCnhFile(f); if (f) { const r = new FileReader(); r.onload = () => setCnhPreview(String(r.result || '')); r.readAsDataURL(f); } else { setCnhPreview(''); } }} className="hidden" />
                <div className="text-[11px] text-slate-500 mt-1">{cnhFile ? cnhFile.name : 'Nenhum arquivo escolhido'}</div>
                <div className="text-[11px] text-slate-500">Foto da CNH</div>
                <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                  {comprovantePreview ? <img src={comprovantePreview} alt="Comprovante" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                </div>
                <label htmlFor="upload_comp_admin" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
                <input id="upload_comp_admin" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setComprovanteFile(f); if (f) { const r = new FileReader(); r.onload = () => setComprovantePreview(String(r.result || '')); r.readAsDataURL(f); } else { setComprovantePreview(''); } }} className="hidden" />
                <div className="text-[11px] text-slate-500 mt-1">{comprovanteFile ? comprovanteFile.name : 'Nenhum arquivo escolhido'}</div>
                <div className="text-[11px] text-slate-500">Comprovante de residência</div>
                <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden">
                  {motoDocPreview ? <img src={motoDocPreview} alt="Doc Moto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
                </div>
                <label htmlFor="upload_moto_admin" className="px-2 py-1 text-xs rounded border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer mt-2">Escolher arquivo</label>
                <input id="upload_moto_admin" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setMotoDocFile(f); if (f) { const r = new FileReader(); r.onload = () => setMotoDocPreview(String(r.result || '')); r.readAsDataURL(f); } else { setMotoDocPreview(''); } }} className="hidden" />
                <div className="text-[11px] text-slate-500 mt-1">{motoDocFile ? motoDocFile.name : 'Nenhum arquivo escolhido'}</div>
                <div className="text-[11px] text-slate-500">Documento da Moto</div>
              </div>
              </div>
            
          </>
        )}
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : (mode === 'public' ? 'Cadastrar' : 'Salvar entregador')}
          </button>
        </div>
      </div>
      )}

      {mode !== 'public' && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <div className="text-sm text-slate-700 mb-2">Importar entregadores via CSV</div>
        <input type="file" accept=".csv" onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setCsvFileName(f.name);
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '');
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            if (lines.length === 0) return setCsvRows([]);
            const headers = lines[0].split(',').map((h) => h.trim());
            const rows: CSVRow[] = [];
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',');
              const rec: Record<string, string> = {};
              headers.forEach((h, idx) => {
                rec[h] = String(cols[idx] ?? '').trim();
              });
              rows.push(rec as CSVRow);
            }
            setCsvRows(rows);
          };
          reader.readAsText(f);
        }} />
        {csvFileName && <div className="mt-2 text-sm text-slate-700">{csvFileName} • {csvRows.length} linhas</div>}
        <div className="mt-3">
          <button
            onClick={async () => {
              if (csvRows.length === 0) return;
              setLoading(true);
              setError(null);
              const batch = csvRows.map((r) => ({
                nome_completo: r.nome_completo || '',
                cpf: r.cpf || null,
                rg: r.rg || null,
                data_nascimento: r.data_nascimento || null,
                telefone: r.telefone || null,
                email: r.email || null,
                cep: r.cep || null,
                rua: r.rua || null,
                numero: r.numero || null,
                complemento: r.complemento || null,
                bairro: r.bairro || null,
                cidade: r.cidade || null,
                veiculo_tipo: (r.veiculo_tipo || null) as Entregador['veiculo_tipo'],
                veiculo_modelo: r.veiculo_modelo || null,
                veiculo_placa: r.veiculo_placa || null,
                veiculo_ano: r.veiculo_ano ? Number(r.veiculo_ano) : null,
                cnh_valida: r.cnh_valida === 'true' || r.cnh_valida === true,
                tipo_entrega: (r.tipo_entrega || null) as Entregador['tipo_entrega'],
                taxa_entrega: r.taxa_entrega ? Number(r.taxa_entrega) : null,
                status: (r.status || 'inativo') as Entregador['status'],
              }));
              const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('entregadores').insert(batch);
              const r = res as unknown as { error?: { message?: string } };
              if (r.error?.message) setError(r.error.message);
              await fetchEntregadores();
              setLoading(false);
            }}
            disabled={loading || csvRows.length === 0}
            className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50"
          >
            {loading ? 'Importando...' : 'Importar entregadores'}
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-600">Cabeçalho: nome_completo, cpf, rg, data_nascimento, telefone, email, cep, rua, numero, complemento, bairro, cidade, veiculo_tipo, veiculo_modelo, veiculo_placa, veiculo_ano, cnh_valida, tipo_entrega, taxa_entrega, status</div>
      </div>
      )}

      {mode !== 'public' && (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-700 mb-4">Gestão de Entregadores</div>
          {loading ? (
            <div className="p-4 text-slate-600 bg-white border border-slate-200 rounded-lg">Carregando...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {[
                { key: 'em_analise', label: 'Em Análise', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
                { key: 'ativo', label: 'Ativos', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
                { key: 'inativo', label: 'Inativos', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' }
              ].map(group => {
                 const items = entregadores.filter(e => {
                    if (group.key === 'em_analise') return e.status === 'em_analise' || !e.status;
                    return e.status === group.key;
                 });
                 const isOpen = expandedStatus[group.key];
                 
                 return (
                   <div key={group.key} className={`border rounded-lg ${group.border} bg-white overflow-hidden shadow-sm`}>
                      <button 
                        onClick={() => toggleStatus(group.key)}
                        className={`w-full flex items-center justify-between px-4 py-3 ${group.bg} ${group.text} font-medium transition-colors hover:opacity-90`}
                      >
                        <div className="flex items-center gap-2">
                           <span>{group.label}</span>
                           <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full border border-black/5">{items.length}</span>
                        </div>
                        <Chevron open={isOpen} />
                      </button>
                      
                      {isOpen && (
                        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                           {items.length === 0 ? (
                              <div className="p-6 text-sm text-slate-400 text-center italic">Nenhum entregador nesta categoria</div>
                           ) : (
                              items.map(c => (
                                 <div key={c.id} className="p-4 hover:bg-slate-50 transition-colors group">
                                   <div className="flex justify-between items-start mb-2">
                                      <div className="font-semibold text-slate-800 text-sm leading-tight">{c.nome_completo}</div>
                                   </div>
                                   <div className="text-xs text-slate-600 space-y-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                        {c.telefone || <span className="text-slate-400 italic">Sem telefone</span>}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        <span className="truncate" title={c.email || ''}>{c.email || <span className="text-slate-400 italic">Sem e-mail</span>}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 012-2h5a2 2 0 012 2" /></svg>
                                        <span className="capitalize">{c.veiculo_tipo || '?'}</span>
                                        {c.veiculo_placa && <span className="text-slate-400">• {c.veiculo_placa}</span>}
                                      </div>
                                   </div>
                                   <div className="mt-3 flex items-center justify-end gap-3 pt-3 border-t border-slate-50">
                                      <button onClick={() => openEdit(c)} className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1 transition-colors">
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (!c.dados_bancarios) {
                                            alert('Este entregador ainda não preencheu os dados bancários no app.');
                                            return;
                                          }
                                          setSelectedBankData(c.dados_bancarios);
                                          setShowBankModal(true);
                                        }}
                                        className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                                      >
                                        Dados Bancários
                                      </button>
                                      <button onClick={() => handleDelete(c.id)} className="text-xs font-medium text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors">
                                        Excluir
                                      </button>
                                   </div>
                                </div>
                              ))
                           )}
                        </div>
                      )}
                   </div>
                 );
              })}
            </div>
          )}
        </div>
      )}
      <Modal
        open={Boolean(editing)}
        title="Editar entregador"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-slate-100 border border-slate-300 overflow-hidden mb-2">
              {editFotoPreview ? <img src={editFotoPreview} alt="Foto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
            </div>
            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setEditFotoFile(f); if (f) { const r = new FileReader(); r.onload = () => setEditFotoPreview(String(r.result || '')); r.readAsDataURL(f); } }} className="text-xs" />
            <div className="text-[11px] text-slate-500">Foto do entregador</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input placeholder="Nome completo" value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CPF" value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="RG" value={editForm.rg} onChange={(e) => setEditForm({ ...editForm, rg: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="date" placeholder="Nascimento" value={editForm.data_nascimento} onChange={(e) => setEditForm({ ...editForm, data_nascimento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Telefone" value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="email" placeholder="E-mail" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input type="password" placeholder="Nova Senha (opcional)" value={(editForm as any).nova_senha} onChange={(e) => setEditForm({ ...editForm, nova_senha: e.target.value } as any)} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="CEP" value={editForm.cep} onChange={(e) => setEditForm({ ...editForm, cep: e.target.value })} onBlur={(e) => handleEditCepBlur(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Rua" value={editForm.rua} onChange={(e) => setEditForm({ ...editForm, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Número" value={editForm.numero} onChange={(e) => setEditForm({ ...editForm, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Complemento" value={editForm.complemento} onChange={(e) => setEditForm({ ...editForm, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Bairro" value={editForm.bairro} onChange={(e) => setEditForm({ ...editForm, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Cidade" value={editForm.cidade} onChange={(e) => setEditForm({ ...editForm, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={editForm.veiculo_tipo} onChange={(e) => setEditForm({ ...editForm, veiculo_tipo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de veículo</option>
            <option value="moto">Moto</option>
            <option value="bike">Bike</option>
            <option value="carro">Carro</option>
          </select>
          <input placeholder="Modelo" value={editForm.veiculo_modelo} onChange={(e) => setEditForm({ ...editForm, veiculo_modelo: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Placa" value={editForm.veiculo_placa} onChange={(e) => setEditForm({ ...editForm, veiculo_placa: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <input placeholder="Ano" value={editForm.veiculo_ano} onChange={(e) => setEditForm({ ...editForm, veiculo_ano: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <div className="flex items-center gap-2">
            <input id="cnh_edit" type="checkbox" checked={editForm.cnh_valida} onChange={(e) => setEditForm({ ...editForm, cnh_valida: e.target.checked })} />
            <label htmlFor="cnh_edit" className="text-sm text-slate-700">CNH válida</label>
          </div>
          <select value={editForm.tipo_entrega} onChange={(e) => setEditForm({ ...editForm, tipo_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="">Tipo de entrega</option>
            <option value="proprio">Próprio</option>
            <option value="terceirizado">Terceirizado</option>
            <option value="parceiro">Parceiro</option>
          </select>
          <input placeholder="Taxa de entrega" value={editForm.taxa_entrega} onChange={(e) => setEditForm({ ...editForm, taxa_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
          <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="px-3 py-2 border border-slate-300 rounded">
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="em_analise">Em Análise</option>
          </select>
          <div className="md:col-span-2 border border-slate-200 rounded p-3 mt-2 bg-slate-50">
            <label className="text-sm font-semibold text-slate-700 block mb-2">Permissão de Coleta</label>
            <div className="flex items-center gap-4 mb-3">
               <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="edit_restricao_clientes_modo" checked={editForm.restricao_clientes_modo === 'todos'} onChange={() => setEditForm({ ...editForm, restricao_clientes_modo: 'todos' })} className="text-sky-600 focus:ring-sky-500" />
                  Todos os clientes
               </label>
               <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="edit_restricao_clientes_modo" checked={editForm.restricao_clientes_modo === 'selecionados'} onChange={() => setEditForm({ ...editForm, restricao_clientes_modo: 'selecionados' })} className="text-sky-600 focus:ring-sky-500" />
                  Somente selecionados
               </label>
            </div>
            {editForm.restricao_clientes_modo === 'selecionados' && (
              <div className="max-h-60 overflow-y-auto border border-slate-300 rounded bg-white p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {clientes.map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer hover:bg-slate-50 p-1 rounded">
                    <input 
                      type="checkbox" 
                      checked={(editForm.clientes_permitidos || []).includes(c.id)}
                      onChange={(e) => {
                         const checked = e.target.checked;
                         setEditForm(prev => {
                           const current = prev.clientes_permitidos || [];
                           return {
                             ...prev,
                             clientes_permitidos: checked 
                               ? [...current, c.id]
                               : current.filter(id => id !== c.id)
                           };
                         });
                      }}
                      className="rounded text-sky-600 focus:ring-sky-500"
                    />
                    <span className="truncate" title={c.nome_completo}>{c.nome_completo}</span>
                  </label>
                ))}
                {clientes.length === 0 && <div className="text-slate-400 text-xs col-span-full">Nenhum cliente ativo encontrado.</div>}
              </div>
            )}
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden mb-2">
                {editCnhPreview ? <img src={editCnhPreview} alt="CNH" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setEditCnhFile(f); if (f) { const r = new FileReader(); r.onload = () => setEditCnhPreview(String(r.result || '')); r.readAsDataURL(f); } }} className="text-xs" />
              <div className="text-[11px] text-slate-500">Foto da CNH</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden mb-2">
                {editComprovantePreview ? <img src={editComprovantePreview} alt="Comprovante" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setEditComprovanteFile(f); if (f) { const r = new FileReader(); r.onload = () => setEditComprovantePreview(String(r.result || '')); r.readAsDataURL(f); } }} className="text-xs" />
              <div className="text-[11px] text-slate-500">Comprovante de residência</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 rounded bg-slate-100 border border-slate-300 overflow-hidden mb-2">
                {editMotoDocPreview ? <img src={editMotoDocPreview} alt="Doc Moto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
              </div>
              <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0] || null; setEditMotoDocFile(f); if (f) { const r = new FileReader(); r.onload = () => setEditMotoDocPreview(String(r.result || '')); r.readAsDataURL(f); } }} className="text-xs" />
              <div className="text-[11px] text-slate-500">Documento da Moto</div>
            </div>
          </div>
        </div>
      </Modal>

      {showBankModal && selectedBankData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-slate-100">
            <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-800">Dados Bancários</h3>
                  <p className="text-xs text-slate-500">Informações financeiras do entregador</p>
                </div>
              </div>
              <button onClick={() => setShowBankModal(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 bg-slate-50/30 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Nome do Titular */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors md:col-span-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Nome do Titular</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.nome_titular || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.nome_titular, 'titular')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Titular"
                    >
                      {copiedField === 'titular' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* CPF/CNPJ */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">CPF/CNPJ</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.cpf_cnpj || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.cpf_cnpj, 'cpf')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar CPF/CNPJ"
                    >
                      {copiedField === 'cpf' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Banco */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Banco</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.banco || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.banco, 'banco')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Banco"
                    >
                      {copiedField === 'banco' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Agência */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Agência</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">{selectedBankData.agencia || '-'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.agencia, 'agencia')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Agência"
                    >
                      {copiedField === 'agencia' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Conta */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Conta</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">
                      {selectedBankData.conta}{selectedBankData.digito ? '-' + selectedBankData.digito : ''}
                    </span>
                    <button 
                      onClick={() => copyToClipboard(`${selectedBankData.conta}${selectedBankData.digito ? '-' + selectedBankData.digito : ''}`, 'conta')}
                      className="text-slate-400 hover:text-sky-600 p-1.5 rounded-md hover:bg-sky-50 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar Conta"
                    >
                      {copiedField === 'conta' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

                {/* Tipo de Conta */}
                <div className="bg-white border border-slate-200 rounded-lg p-3 relative group hover:border-sky-300 transition-colors">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Tipo de Conta</span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8">
                      {selectedBankData.tipo_conta === 'poupanca' ? 'Poupança' : 'Corrente'}
                    </span>
                  </div>
                </div>

                {/* Chave PIX */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 relative group hover:border-emerald-400 transition-colors md:col-span-2">
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Chave PIX
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-900 truncate pr-8 text-lg">{selectedBankData.chave_pix || 'Não informada'}</span>
                    <button 
                      onClick={() => copyToClipboard(selectedBankData.chave_pix, 'pix')}
                      className="text-emerald-400 hover:text-emerald-700 p-1.5 rounded-md hover:bg-emerald-100 transition-all absolute right-2 top-1/2 -translate-y-1/2"
                      title="Copiar PIX"
                    >
                      {copiedField === 'pix' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>

              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button 
                onClick={() => setShowBankModal(false)} 
                className="px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-colors shadow-sm text-sm"
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
