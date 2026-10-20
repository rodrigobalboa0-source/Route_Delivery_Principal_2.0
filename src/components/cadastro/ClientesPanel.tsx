import { useEffect, useState } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { Modal } from '../Modal';
import { AddressPinPicker, type AddressPinPickerConfirmedResult } from '../AddressPinPicker';
import type { Database } from '../../lib/database.types';

type TabelaPreco = Database['public']['Tables']['tabelas_precos']['Row'];
type TabelaComissao = Database['public']['Tables']['tabelas_comissoes']['Row'];
type ModalRow = Database['public']['Tables']['modais']['Row'];

interface PrecificacaoConfigItem {
  modal: string;
  preco_ponto: string;
  tipo_precificacao: string;
  tabela_id: string;
}

interface LimiteRule {
  id?: string;
  entregador_id: string | null;
  limite: number;
  entregador_nome?: string;
}

type Cliente = Database['public']['Tables']['clientes']['Row'];
type EnderecoInsert = Database['public']['Tables']['cliente_enderecos']['Insert'];
type EnderecoEdit = {
  id?: string;
  cep?: string | null;
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  referencia_entrega?: string | null;
};

export function ClientesPanel({ mode = 'admin', initialEditId }: { mode?: 'admin' | 'public', initialEditId?: string }) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [showForm, setShowForm] = useState(mode === 'public');
  const Chevron = ({ open }: { open: boolean }) => (
    <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}>
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const [editForm, setEditForm] = useState({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    metodo_pagamento_preferido: '',
    observacoes: '',
    latitude: '',
    longitude: '',
    modo_faturamento: 'credito',
    faturamento_periodo: 'quinzenal',
    faturamento_vencimento_dias: '3',
    faturamento_tipo_cobranca: 'Por Entregas',
    faturamento_adicional_1: '',
    faturamento_adicional_2: '',
    faturamento_cobrar_taxas_sem_entregas: false,
    faturamento_instrucoes: '',
    faturamento_observacoes: '',
    faturamento_emails: [] as string[],
    faturamento_email_input: '',
    segmento: '',
    data_inicio: '',
    razao_social: '',
    nome_fantasia: '',
    cadastro_via: '',
    tipo_documento: 'cnpj',
    cnpj: '',
    lead_por: '',
    franquia: '',
    hub: '',
    foto_url: '',
    foto_base64: '',
    nova_senha: '',
    precificacao_config: [] as PrecificacaoConfigItem[],
    google_maps_api_key: '',
    google_maps_map_id: '',
  });
  const [tabelasPrecos, setTabelasPrecos] = useState<TabelaPreco[]>([]);
  const [tabelasComissoes, setTabelasComissoes] = useState<TabelaComissao[]>([]);
  const [editTabelaComissaoId, setEditTabelaComissaoId] = useState<string>('');
  const [formTabelaComissaoId, setFormTabelaComissaoId] = useState<string>('');
  const [modais, setModais] = useState<ModalRow[]>([]);
  const [editEnderecos, setEditEnderecos] = useState<EnderecoEdit[]>([]);
  const [editEnderecoNovo, setEditEnderecoNovo] = useState<EnderecoEdit>({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
  const [editEnderecosRemovidos, setEditEnderecosRemovidos] = useState<string[]>([]);
  const [editMembers, setEditMembers] = useState<Array<{ id: string; email: string }>>([]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [editLimites, setEditLimites] = useState<LimiteRule[]>([]);
  const [editLimitesRemovidos, setEditLimitesRemovidos] = useState<string[]>([]);
  const [entregadoresList, setEntregadoresList] = useState<Array<{ id: string; nome_completo: string }>>([]);
  const [limiteNovoEntregadorId, setLimiteNovoEntregadorId] = useState<string>('todos');
  const [limiteNovoValor, setLimiteNovoValor] = useState<number>(1);

  const [form, setForm] = useState({
    nome_completo: '',
    cpf: '',
    data_nascimento: '',
    telefone: '',
    email: '',
    senha: '',
    metodo_pagamento_preferido: '',
    observacoes: '',
    modo_faturamento: 'credito',
    faturamento_periodo: 'quinzenal',
    faturamento_vencimento_dias: '3',
    faturamento_tipo_cobranca: 'Por Entregas',
    faturamento_adicional_1: '',
    faturamento_adicional_2: '',
    faturamento_cobrar_taxas_sem_entregas: false,
    faturamento_instrucoes: '',
    faturamento_observacoes: '',
    faturamento_emails: [] as string[],
    faturamento_email_input: '',
    segmento: '',
    data_inicio: '',
    razao_social: '',
    nome_fantasia: '',
    cadastro_via: '',
    tipo_documento: 'cnpj',
    cnpj: '',
    lead_por: '',
    franquia: '',
    hub: '',
    foto_url: '',
    foto_base64: '',
    precificacao_config: [] as PrecificacaoConfigItem[],
    latitude: '',
    longitude: '',
  });
  const [pinPicker, setPinPicker] = useState<{ target: 'create' | 'edit'; addressText: string } | null>(null);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>('');
  const [editFotoFile, setEditFotoFile] = useState<File | null>(null);
  const [editFotoPreview, setEditFotoPreview] = useState<string>('');
  const [enderecos, setEnderecos] = useState<EnderecoInsert[]>([]);
  const [enderecoAtual, setEnderecoAtual] = useState<EnderecoInsert>({
    cliente_id: '',
    cep: '',
    rua: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    referencia_entrega: '',
  });
  const [newMembers, setNewMembers] = useState<Array<{ email: string; password: string }>>([]);
  const [newMemberEmailCreate, setNewMemberEmailCreate] = useState('');
  const [newMemberPasswordCreate, setNewMemberPasswordCreate] = useState('');

  useEffect(() => {
    fetchClientes();
    fetchTabelasPrecos();
  }, []);

  useEffect(() => {
    if (initialEditId && clientes.length > 0) {
      const target = clientes.find(c => c.id === initialEditId);
      if (target) {
        openEdit(target);
      }
    }
  }, [initialEditId, clientes]);

  const fetchTabelasPrecos = async () => {
    const [precosRes, comissoesRes] = await Promise.all([
      supabase.from('tabelas_precos').select('*').order('nome'),
      supabase.from('tabelas_comissoes').select('id, nome, cliente_ids, ativo').eq('ativo', true).order('nome'),
    ]);
    setTabelasPrecos(precosRes.data || []);
    setTabelasComissoes((comissoesRes.data || []) as TabelaComissao[]);
    const { data: m } = await supabase.from('modais').select('*').eq('ativo', true).order('tipo');
    setModais(m || []);
    const { data: entregadores } = await supabase.from('entregadores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo');
    setEntregadoresList((entregadores || []).map(e => ({ id: String(e.id), nome_completo: String(e.nome_completo || '') })));
  };

  const fetchClientes = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from('clientes').select('*').order('nome_completo');
    if (error) setError(error.message);
    setClientes(data || []);
    setLoading(false);
  };

  const addEndereco = () => {
    setEnderecos((prev) => [...prev, { ...enderecoAtual }]);
    setEnderecoAtual({ cliente_id: '', cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
  };

  const removeEndereco = (idx: number) => {
    setEnderecos((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateCreateConfig = (modal: string, field: keyof PrecificacaoConfigItem, value: string) => {
    setForm(prev => {
      const existingIndex = prev.precificacao_config.findIndex(c => c.modal === modal);
      let newConfig = [...prev.precificacao_config];
      
      const defaultConfig = {
        modal,
        preco_ponto: '0.00',
        tipo_precificacao: 'Distância',
        tabela_id: ''
      };

      if (existingIndex >= 0) {
        newConfig[existingIndex] = { ...newConfig[existingIndex], [field]: value };
      } else {
        
        newConfig.push({ ...defaultConfig, [field]: value });
      }
      
      return { ...prev, precificacao_config: newConfig };
    });
  };

  const parseIds = (raw: unknown): string[] => {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return [];
  };

  const assignComissaoTable = async (clienteId: string, selectedTabelaId: string) => {
    const { data: allTables } = await supabase.from('tabelas_comissoes').select('id, cliente_ids');
    if (!allTables) return;
    await Promise.all(allTables.map(async (table) => {
      const current = parseIds(table.cliente_ids);
      const shouldBeIn = table.id === selectedTabelaId;
      const isIn = current.includes(clienteId);
      if (shouldBeIn && !isIn) {
        await supabase.from('tabelas_comissoes').update({ cliente_ids: [...current, clienteId] }).eq('id', table.id);
      } else if (!shouldBeIn && isIn) {
        await supabase.from('tabelas_comissoes').update({ cliente_ids: current.filter((id: string) => id !== clienteId) }).eq('id', table.id);
      }
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    let authUserId: string | undefined;
    try {
      const shouldRegisterAuth = Boolean((form.email || '').trim()) && Boolean((form.senha || '').trim());
      if (shouldRegisterAuth) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.senha,
          options: {
            data: {
              full_name: form.nome_completo,
              role: 'cliente',
            },
          },
        });
        if (signUpError) {
          const err = signUpError as unknown as { message?: string; status?: number };
          const status = err?.status;
          const rawMsg = err?.message || 'Falha ao criar acesso de login';
          const msg = rawMsg;
          const isDuplicateEmail = /duplicate key value .*users_email(_partial)?_key/i.test(rawMsg) || /duplicate key value .*users_email/i.test(rawMsg);
          const isUserAlreadyExists = (status === 422 && /user already/i.test(rawMsg)) || isDuplicateEmail;
          
          if (isUserAlreadyExists) {
             setError('Este e-mail já possui um acesso criado. Use outro e-mail ou apenas faça login.');
             setLoading(false);
             return;
          }

          if (mode === 'public') {
            console.error('Erro ao criar acesso de login no fluxo público (ignorado para não travar cadastro):', err);
          } else {
            setError(msg);
            setLoading(false);
            return;
          }
        } else if (signUpData?.user?.id) {
          authUserId = signUpData.user.id;
          await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
            .from('users')
            .upsert({ id: authUserId, email: form.email, full_name: form.nome_completo, role: 'cliente' });
        }
      }
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      if (msg) setError(msg);
    }

    const hasEnderecoAtual = Boolean((enderecoAtual.cep || '').trim() || (enderecoAtual.rua || '').trim() || (enderecoAtual.numero || '').trim());

    if (hasEnderecoAtual) {
      if (!enderecoAtual.cep || !enderecoAtual.rua || !enderecoAtual.numero || !enderecoAtual.bairro || !enderecoAtual.cidade) {
        setError('Para cadastrar o endereço, preencha obrigatoriamente: CEP, Rua, Número, Bairro e Cidade.');
        setLoading(false);
        return;
      }
    }

    const primaryAddress: EnderecoInsert | null = hasEnderecoAtual ? enderecoAtual : (enderecos.length > 0 ? enderecos[0] : null);

    const rpcPayload: Record<string, unknown> = {
      nome_completo: form.nome_completo,
      cpf: form.cpf || null,
      data_nascimento: form.data_nascimento || null,
      telefone: form.telefone || null,
      email: (form.email || '').trim() ? (form.email || '').trim().toLowerCase() : null,
      metodo_pagamento_preferido: form.metodo_pagamento_preferido || null,
      observacoes: form.observacoes || null,
      segmento: form.segmento || null,
      data_inicio: form.data_inicio || null,
      razao_social: form.razao_social || null,
      nome_fantasia: form.nome_fantasia || null,
      cadastro_via: form.cadastro_via || null,
      tipo_documento: form.tipo_documento || null,
      cnpj: form.cnpj || null,
      lead_por: form.lead_por || null,
      franquia: form.franquia || null,
      hub: form.hub || null,
      precificacao_config: form.precificacao_config ?? null,
      cep: primaryAddress?.cep || null,
      rua: primaryAddress?.rua || null,
      numero: primaryAddress?.numero || null,
      complemento: primaryAddress?.complemento || null,
      bairro: primaryAddress?.bairro || null,
      cidade: primaryAddress?.cidade || null,
      referencia_entrega: primaryAddress?.referencia_entrega || null,
    };
    if (authUserId) rpcPayload.id = authUserId;

    const { data: rpcData, error: rpcError } = await supabase.rpc('cadastrar_cliente', { payload: rpcPayload });
    if (rpcError) {
      if (/duplicate key/i.test(rpcError.message)) {
        setError('Já existe um comércio cadastrado com estes dados (e-mail, CPF ou CNPJ).');
      } else {
        setError(rpcError.message);
      }
      setLoading(false);
      return;
    }
    const rpcResult = rpcData as { id?: string; success?: boolean; error?: string; message?: string };
    if (!rpcResult?.success) {
      const msg = rpcResult?.message || 'Erro ao salvar o comércio.';
      if (/duplicate_key/.test(rpcResult?.error || '') || /duplicate key/i.test(msg)) {
        setError('Já existe um comércio cadastrado com estes dados (e-mail, CPF ou CNPJ).');
      } else {
        setError(msg);
      }
      setLoading(false);
      return;
    }
    const cid = (rpcResult?.id || '') as string;
    
    if (!cid) {
      setError('Erro ao salvar o comércio: ID não retornado. Tente novamente.');
      setLoading(false);
      return;
    }
    
    if ((form.email || '').trim()) {
      try {
        const { data: userData } = await supabase.from('users').select('id').eq('email', form.email).maybeSingle();
        if (userData?.id) {
          await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
            .from('users')
            .upsert({ id: userData.id, email: form.email, full_name: form.nome_completo, role: 'cliente', cliente_id: cid });
        }
      } catch (e) { void e; }
    }

    let finalFotoUrl = form.foto_url;
    let finalFotoBase64 = form.foto_base64;

    if (fotoFile) {
      try {
        const fileExt = fotoFile.name.split('.').pop() || 'jpg';
        const fileName = `clientes/${cid}/foto-${Date.now()}.${fileExt}`;
        
        const { data: upData, error: upError } = await supabase.storage
          .from('images')
          .upload(fileName, fotoFile, { upsert: true });
        
        if (upError) {
           console.error('Erro no upload da imagem:', upError);
           throw upError;
        }

        if (upData?.path) {
          const { data } = supabase.storage.from('images').getPublicUrl(upData.path);
          finalFotoUrl = data.publicUrl;
        }
      } catch (err) {
        console.error('Falha no upload, usando base64:', err);
        const reader = new FileReader();
        await new Promise((resolve) => {
             reader.onload = () => { finalFotoBase64 = String(reader.result || ''); resolve(true); };
             reader.readAsDataURL(fotoFile);
        });
      }
    }

    const enderecosParaSalvar = (() => {
      
      if (hasEnderecoAtual) return [...enderecos, { ...enderecoAtual }];
      return enderecos;
    })();

    for (const e of enderecosParaSalvar) {
      await sbInsert('cliente_enderecos', {
        cliente_id: cid,
        cep: e.cep || null,
        rua: e.rua || null,
        numero: e.numero || null,
        complemento: e.complemento || null,
        bairro: e.bairro || null,
        cidade: e.cidade || null,
        referencia_entrega: e.referencia_entrega || null,
      });
    }
    if (mode !== 'public') {
      for (const u of newMembers) {
        try {
          const { data: su, error: se } = await supabase.auth.signUp({ email: u.email, password: u.password });
          if (!se) {
            const uid = su?.user?.id || undefined;
            await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
              .from('users')
              .upsert({ id: uid, email: u.email, full_name: form.nome_completo, role: 'cliente', cliente_id: cid });
          }
        } catch (e) { void e; }
      }
    }
    try {
      const { error: updateError } = await supabase
        .from('clientes')
        .update({
          segmento: form.segmento || null,
          data_inicio: form.data_inicio || null,
          razao_social: form.razao_social || null,
          nome_fantasia: form.nome_fantasia || null,
          cadastro_via: form.cadastro_via || null,
          tipo_documento: form.tipo_documento || null,
          cnpj: form.cnpj || null,
          lead_por: form.lead_por || null,
          franquia: form.franquia || null,
          hub: form.hub || null,
          foto_url: finalFotoUrl || null,
          foto_base64: finalFotoBase64 || null,
          precificacao_config: form.precificacao_config,
          latitude: form.latitude ? Number(form.latitude) : null,
          longitude: form.longitude ? Number(form.longitude) : null,
        })
        .eq('id', cid);
        
      if (updateError) throw updateError;
    } catch (e: any) {
      console.error('Erro ao atualizar dados complementares do cliente:', e);
      const extras = {
        segmento: form.segmento,
        data_inicio: form.data_inicio,
        razao_social: form.razao_social,
        nome_fantasia: form.nome_fantasia,
        cadastro_via: form.cadastro_via,
        tipo_documento: form.tipo_documento,
        cnpj: form.cnpj,
        lead_por: form.lead_por,
        franquia: form.franquia,
        hub: form.hub,
        foto_url: form.foto_url,
        foto_base64: form.foto_base64,
        endereco: {
          cep: primaryAddress?.cep,
          rua: primaryAddress?.rua,
          numero: primaryAddress?.numero,
          complemento: primaryAddress?.complemento,
          bairro: primaryAddress?.bairro,
          cidade: primaryAddress?.cidade,
          referencia_entrega: primaryAddress?.referencia_entrega,
        },
      };
      const mergedObs = JSON.stringify({ extras, observacoes: form.observacoes || '' });
      await supabase
        .from('clientes')
        .update({ observacoes: mergedObs })
        .eq('id', cid);
      void e;
    }
    
    if (formTabelaComissaoId) await assignComissaoTable(cid, formTabelaComissaoId);
    setFormTabelaComissaoId('');
    setForm({
      nome_completo: '',
      cpf: '',
      data_nascimento: '',
      telefone: '',
      email: '',
      senha: '',
      metodo_pagamento_preferido: '',
      observacoes: '',
      modo_faturamento: 'credito',
      faturamento_periodo: 'quinzenal',
      faturamento_vencimento_dias: '3',
      faturamento_tipo_cobranca: 'Por Entregas',
      faturamento_adicional_1: '',
      faturamento_adicional_2: '',
      faturamento_cobrar_taxas_sem_entregas: false,
      faturamento_instrucoes: '',
      faturamento_observacoes: '',
      faturamento_emails: [],
      faturamento_email_input: '',
      segmento: '',
      data_inicio: '',
      razao_social: '',
      nome_fantasia: '',
      cadastro_via: '',
      tipo_documento: 'cnpj',
      cnpj: '',
      lead_por: '',
      franquia: '',
      hub: '',
      foto_url: '',
      foto_base64: '',
      precificacao_config: [],
      latitude: '',
      longitude: '',
    });
    setFotoFile(null);
    setFotoPreview('');
    setEnderecos([]);
    if (mode !== 'public') setNewMembers([]);
    // Cadastro público de comércio: confirma e leva para a área do lojista (login),
    // em vez de deixar o usuário "voltar" para o painel ADM.
    if (mode === 'public') {
      setLoading(false);
      alert('Comércio cadastrado com sucesso! Faça login para acessar.');
      window.location.href = '/comercio';
      return;
    }
    await fetchClientes();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente? Isso apagará TODOS os dados vinculados.')) return;
    setLoading(true);
    try {
      
      const { data: client, error: fetchError } = await supabase.from('clientes').select('email').eq('id', id).maybeSingle();
      if (fetchError) throw new Error('Erro ao buscar dados do cliente: ' + fetchError.message);
      if (!client) throw new Error('Cliente não encontrado.');
      
      const email = (client.email || '').trim().toLowerCase();

      
      const criticalTables = ['creditos_clientes', 'contas_receber', 'pedidos', 'cliente_enderecos', 'users'];
      
      const deleteWithCheck = async (table: string, col: string = 'cliente_id') => {
        const { error } = await (supabase as any).from(table).delete().eq(col, id);
        if (error) {
           console.error(`Erro ao limpar ${table}:`, error);
           if (criticalTables.includes(table)) {
               throw new Error(`Não foi possível remover dados de ${table}: ${error.message}`);
           }
        }
      };

      
      await deleteWithCheck('configuracoes_comercio', 'id');
      await deleteWithCheck('configuracoes_operacao', 'id');
      await deleteWithCheck('integracoes_externas', 'id');
      await deleteWithCheck('integracoes_open_delivery', 'id');
      await deleteWithCheck('cliente_enderecos');
      await deleteWithCheck('mensagens_clientes');
      await deleteWithCheck('contas_receber');
      await deleteWithCheck('creditos_clientes');
      await deleteWithCheck('notas_fiscais');
      await deleteWithCheck('recibos');
      await deleteWithCheck('nova_entrega');
      await deleteWithCheck('deliveries');
      await deleteWithCheck('pedidos');

      
       try {
         await supabase.from('conversas').delete().eq('tipo_alvo', 'cliente').eq('alvo_id', id);
       } catch (e) { void e; }

      
      
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
          
          const { data: currentUserData } = await supabase
            .from('users')
            .select('id, role, cliente_id')
            .eq('id', currentUser.id)
            .maybeSingle();

          
          if (currentUserData?.cliente_id === id) {
              
              if (['admin', 'operador', 'franquia'].includes(currentUserData.role || '')) {
                  await supabase.from('users').update({ cliente_id: null }).eq('id', currentUser.id);
              } else {
                  
              }
          }

          
          const { error: userDelErr } = await (supabase as any)
            .from('users')
            .delete()
            .eq('cliente_id', id);
            
          if (userDelErr) {
             console.error('Erro ao limpar users:', userDelErr);
             throw new Error('Erro ao remover usuários vinculados: ' + userDelErr.message);
          }
      } else {
          
           await deleteWithCheck('users');
      }

      
      const { error: delErr, count } = await supabase.from('clientes').delete({ count: 'exact' }).eq('id', id);
      
      if (delErr) throw delErr;
      if (count === 0) {
          throw new Error('O comando foi executado mas nenhum registro foi removido. Verifique permissões (RLS) ou se o registro já foi excluído.');
      }

      
      if (email) {
          
          try {
              await (supabase as any).from('users').delete().ilike('email', email);
          } catch (e) { void e; }

          
          
          try {
            const { data: userRow } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
            const userId = (userRow as { id?: string } | null)?.id;
            if (userId) await supabase.from('delivery_logs').update({ created_by: null }).eq('created_by', userId);
          } catch (e) {
            console.warn('Erro ao limpar delivery_logs.created_by:', e);
          }

          const { error: fnError } = await supabase.functions.invoke('delete-auth-user-by-email', {
              body: { email }
          });
          
          if (fnError) {
              console.warn('Erro ao deletar Auth User (Edge Function):', fnError);
              alert('Aviso: Cliente excluído do banco de dados, mas o login não pôde ser removido automaticamente (Erro na Edge Function). Contate o suporte.');
          }
          
          
          try {
            const { data: session } = await supabase.auth.getSession();
            const currentEmail = (session.session?.user?.email || '').trim().toLowerCase();
            if (currentEmail && currentEmail === email) {
                await supabase.auth.signOut();
                window.location.reload();
                return;
            }
          } catch (e) { void e; }
      }

      alert('Cliente excluído com sucesso!');
      
    } catch (e: any) {
      alert('Falha ao excluir: ' + (e.message || e));
      console.error(e);
    } finally {
      setLoading(false);
      await fetchClientes();
    }
  };

  const openEdit = async (c: Cliente) => {
    
    const { data: allTables } = await supabase.from('tabelas_comissoes').select('id, cliente_ids');
    const currentTable = (allTables || []).find(t => parseIds(t.cliente_ids).includes(c.id));
    setEditTabelaComissaoId(currentTable?.id || '');
    setEditing(c);
    const pConfig = (c.precificacao_config as unknown as PrecificacaoConfigItem[]) || [];
    setEditForm({
      nome_completo: c.nome_completo,
      cpf: c.cpf || '',
      data_nascimento: c.data_nascimento || '',
      telefone: c.telefone || '',
      email: c.email || '',
      metodo_pagamento_preferido: c.metodo_pagamento_preferido || '',
      observacoes: c.observacoes || '',
      latitude: c.latitude == null ? '' : String(c.latitude),
      longitude: c.longitude == null ? '' : String(c.longitude),
      modo_faturamento: c.modo_faturamento || 'credito',
      faturamento_periodo: c.faturamento_periodo || 'quinzenal',
      faturamento_vencimento_dias: String(c.faturamento_vencimento_dias || '3'),
      faturamento_tipo_cobranca: c.faturamento_tipo_cobranca || 'Por Entregas',
      faturamento_adicional_1: String(c.faturamento_adicional_1 || ''),
      faturamento_adicional_2: String(c.faturamento_adicional_2 || ''),
      faturamento_cobrar_taxas_sem_entregas: c.faturamento_cobrar_taxas_sem_entregas || false,
      faturamento_instrucoes: c.faturamento_instrucoes || '',
      faturamento_observacoes: c.faturamento_observacoes || '',
      faturamento_emails: c.faturamento_emails || [],
      faturamento_email_input: '',
      segmento: '',
      data_inicio: '',
      razao_social: '',
      nome_fantasia: '',
      cadastro_via: '',
      tipo_documento: 'cnpj',
      cnpj: '',
      lead_por: '',
      franquia: '',
      hub: '',
      foto_url: c.foto_url || '',
      foto_base64: c.foto_base64 || '',
      nova_senha: '',
      precificacao_config: pConfig,
      google_maps_api_key: (c as any).google_maps_api_key || '',
      google_maps_map_id: (c as any).google_maps_map_id || '',
    });
    
    
    if (c.foto_url) setEditFotoPreview(c.foto_url);
    else if (c.foto_base64) setEditFotoPreview(c.foto_base64);
    else setEditFotoPreview('');

    try {
      const obs = String(c.observacoes || '');
      const parsed = obs.startsWith('{') ? JSON.parse(obs) : null;
      const extras = parsed?.extras || null;
      if (extras) {
        setEditForm((prev) => ({
          ...prev,
          segmento: extras.segmento || prev.segmento,
          data_inicio: extras.data_inicio || prev.data_inicio,
          razao_social: extras.razao_social || prev.razao_social,
          nome_fantasia: extras.nome_fantasia || prev.nome_fantasia,
          cadastro_via: extras.cadastro_via || prev.cadastro_via,
          tipo_documento: extras.tipo_documento || prev.tipo_documento,
          cnpj: extras.cnpj || prev.cnpj,
          lead_por: extras.lead_por || prev.lead_por,
          franquia: extras.franquia || prev.franquia,
          hub: extras.hub || prev.hub,
          
        }));
        
        if (!c.foto_url && !c.foto_base64) {
           if (extras.foto_url) setEditFotoPreview(extras.foto_url);
           if (extras.foto_base64) setEditFotoPreview(extras.foto_base64);
        }
      }
    } catch (e) { void e; }
    const { data } = await supabase.from('cliente_enderecos').select('*').eq('cliente_id', c.id).order('created_at');
    const lista = (data || []).map((e: any) => ({
      id: e.id as string,
      cep: e.cep ?? null,
      rua: e.rua ?? null,
      numero: e.numero ?? null,
      complemento: e.complemento ?? null,
      bairro: e.bairro ?? null,
      cidade: e.cidade ?? null,
      referencia_entrega: e.referencia_entrega ?? null,
    }));
    setEditEnderecos(lista);
    setEditEnderecoNovo({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
    setEditEnderecosRemovidos([]);
    const { data: membros } = await supabase.from('users').select('id,email').eq('cliente_id', c.id);
    setEditMembers((membros || []).map((m: any) => ({ id: String(m.id), email: String(m.email || '') })));
    const { data: limites } = await (supabase as any).from('comercio_entregador_limites')
      .select('id, entregador_id, limite')
      .eq('cliente_id', c.id);
    setEditLimites((limites || []).map((l: any) => ({
      id: l.id,
      entregador_id: l.entregador_id,
      limite: l.limite,
      entregador_nome: entregadoresList.find(e => e.id === l.entregador_id)?.nome_completo,
    })));
    setEditLimitesRemovidos([]);
    setLimiteNovoEntregadorId('todos');
    setLimiteNovoValor(1);
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setLoading(true);
    setError(null);

    const latText = String((editForm as any).latitude || '').trim();
    const lngText = String((editForm as any).longitude || '').trim();
    const latitude = latText ? Number(latText) : null;
    const longitude = lngText ? Number(lngText) : null;
    if (latText && Number.isNaN(latitude as any)) {
      setError('Latitude inválida');
      setLoading(false);
      return;
    }
    if (lngText && Number.isNaN(longitude as any)) {
      setError('Longitude inválida');
      setLoading(false);
      return;
    }

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
        } else {
           // Limpa o campo assim que a troca é aplicada — sem isso, qualquer
           // "Salvar" seguinte nessa mesma sessão de edição (mesmo só pra
           // corrigir outro campo, sem intenção de mexer na senha) reenviava
           // essa mesma senha de novo silenciosamente, trocando ela sem o
           // operador perceber.
           setEditForm(prev => ({ ...prev, nova_senha: '' } as any));
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
             role: 'cliente',
             cliente_id: editing.id
          });
    } catch (e) { console.error('Users sync update error', e); }

    let finalEditFotoUrl = editForm.foto_url;
    let finalEditFotoBase64 = editForm.foto_base64;

    if (editFotoFile && editing?.id) {
      try {
        const fileExt = editFotoFile.name.split('.').pop() || 'jpg';
        const fileName = `clientes/${editing.id}/foto-${Date.now()}.${fileExt}`;
        
        const { data: upData, error: upError } = await supabase.storage
          .from('images')
          .upload(fileName, editFotoFile, { upsert: true });

        if (upError) {
           console.error('Erro no upload da imagem (edição):', upError);
           throw upError;
        }

        if (upData?.path) {
          const { data } = supabase.storage.from('images').getPublicUrl(upData.path);
          finalEditFotoUrl = data.publicUrl;
        }
      } catch (e) {
          console.error('Falha no upload (edição), usando base64:', e);
          const reader = new FileReader();
          await new Promise((resolve) => {
               reader.onload = () => { finalEditFotoBase64 = String(reader.result || ''); resolve(true); };
               reader.readAsDataURL(editFotoFile);
          });
      }
    }

    let primaryAddressUpdate = {};
    const candidateAddress = editEnderecos.length > 0 ? editEnderecos[0] : (
      (editEnderecoNovo.cep || editEnderecoNovo.rua) ? editEnderecoNovo : null
    );

    if (candidateAddress) {
      primaryAddressUpdate = {
        cep: candidateAddress.cep || null,
        rua: candidateAddress.rua || null,
        numero: candidateAddress.numero || null,
        complemento: candidateAddress.complemento || null,
        bairro: candidateAddress.bairro || null,
        cidade: candidateAddress.cidade || null,
        referencia_entrega: candidateAddress.referencia_entrega || null,
      };
    }

    const res = await supabase
      .from('clientes')
      .update({
        nome_completo: editForm.nome_completo,
        cpf: editForm.cpf || null,
        data_nascimento: editForm.data_nascimento || null,
        telefone: editForm.telefone || null,
        email: editForm.email || null,
        metodo_pagamento_preferido: editForm.metodo_pagamento_preferido || null,
        observacoes: editForm.observacoes || null,
        latitude,
        longitude,
        segmento: editForm.segmento || null,
        data_inicio: editForm.data_inicio || null,
        razao_social: editForm.razao_social || null,
        nome_fantasia: editForm.nome_fantasia || null,
        cadastro_via: editForm.cadastro_via || null,
        tipo_documento: editForm.tipo_documento || null,
        cnpj: editForm.cnpj || null,
        lead_por: editForm.lead_por || null,
        franquia: editForm.franquia || null,
        hub: editForm.hub || null,
        foto_url: finalEditFotoUrl || null,
        foto_base64: finalEditFotoBase64 || null,
        precificacao_config: editForm.precificacao_config,
        modo_faturamento: editForm.modo_faturamento,
        faturamento_periodo: editForm.faturamento_periodo,
        faturamento_vencimento_dias: Number(editForm.faturamento_vencimento_dias) || 3,
        faturamento_tipo_cobranca: editForm.faturamento_tipo_cobranca,
        faturamento_adicional_1: Number(editForm.faturamento_adicional_1) || 0,
        faturamento_adicional_2: Number(editForm.faturamento_adicional_2) || 0,
        faturamento_cobrar_taxas_sem_entregas: editForm.faturamento_cobrar_taxas_sem_entregas,
        faturamento_instrucoes: editForm.faturamento_instrucoes,
        faturamento_observacoes: editForm.faturamento_observacoes,
        faturamento_emails: editForm.faturamento_emails,
        google_maps_api_key: (editForm as any).google_maps_api_key || null,
        google_maps_map_id: (editForm as any).google_maps_map_id || null,
        ...primaryAddressUpdate,
      })
      .eq('id', editing.id);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) {
      setError(r.error.message);
      setLoading(false);
      return;
    }
    {
      const updates = editEnderecos.filter((e) => e.id).map((e) =>
        supabase
          .from('cliente_enderecos')
          .update({
            cep: e.cep ?? null,
            rua: e.rua ?? null,
            numero: e.numero ?? null,
            complemento: e.complemento ?? null,
            bairro: e.bairro ?? null,
            cidade: e.cidade ?? null,
            referencia_entrega: e.referencia_entrega ?? null,
          })
          .eq('id', e.id as string)
      );
      const hasNovo = Boolean((editEnderecoNovo.cep || '').trim() || (editEnderecoNovo.rua || '').trim() || (editEnderecoNovo.numero || '').trim() || (editEnderecoNovo.bairro || '').trim() || (editEnderecoNovo.cidade || '').trim() || (editEnderecoNovo.complemento || '').trim() || (editEnderecoNovo.referencia_entrega || '').trim());
      const baseInserts = editEnderecos.filter((e) => !e.id);
      const allInserts = hasNovo ? [...baseInserts, editEnderecoNovo] : baseInserts;
      const inserts = allInserts.map((e) =>
        sbInsert('cliente_enderecos', {
          cliente_id: editing.id as string,
          cep: e.cep ?? null,
          rua: e.rua ?? null,
          numero: e.numero ?? null,
          complemento: e.complemento ?? null,
          bairro: e.bairro ?? null,
          cidade: e.cidade ?? null,
          referencia_entrega: e.referencia_entrega ?? null,
        })
      );
      const deletes = editEnderecosRemovidos.map((id) => supabase.from('cliente_enderecos').delete().eq('id', id));
      await Promise.all([...updates, ...inserts, ...deletes]);
    }
    
    await assignComissaoTable(editing.id, editTabelaComissaoId);
    
    if (editLimitesRemovidos.length > 0) {
      await (supabase as any).from('comercio_entregador_limites').delete().in('id', editLimitesRemovidos);
    }
    for (const rule of editLimites) {
      if (rule.id) {
        await (supabase as any).from('comercio_entregador_limites').update({ limite: rule.limite, updated_at: new Date().toISOString() }).eq('id', rule.id);
      } else {
        await (supabase as any).from('comercio_entregador_limites').insert({ cliente_id: editing.id, entregador_id: rule.entregador_id, limite: rule.limite });
      }
    }
    setEditing(null);
    setLoading(false);
    await fetchClientes();
  };

  const openPinPicker = (target: 'create' | 'edit', addressText: string) => {
    setPinPicker({ target, addressText });
  };

  const handleConfirmPin = (result: AddressPinPickerConfirmedResult) => {
    if (!pinPicker) return;
    if (pinPicker.target === 'create') {
      setForm((prev) => ({ ...prev, latitude: String(result.lat), longitude: String(result.lng) }));
    } else {
      setEditForm((prev) => ({ ...prev, latitude: String(result.lat), longitude: String(result.lng) } as any));
    }
    setPinPicker(null);
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
      setEnderecoAtual((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
      }));
    }
  };

  const handleEditNewCepBlur = async (cep: string) => {
    const data = await fetchAddressByCep(cep);
    if (data) {
      setEditEnderecoNovo((prev) => ({
        ...prev,
        rua: data.logradouro || prev.rua,
        bairro: data.bairro || prev.bairro,
        cidade: data.localidade || prev.cidade,
      }));
    }
  };

  const handleEditExistingCepBlur = async (index: number, cep: string) => {
    const data = await fetchAddressByCep(cep);
    if (data) {
      setEditEnderecos((prev) => prev.map((e, i) => i === index ? {
        ...e,
        rua: data.logradouro || e.rua,
        bairro: data.bairro || e.bairro,
        cidade: data.localidade || e.cidade,
      } : e));
    }
  };

  return (
    <div className="p-6">
      <style>{`
        .fade-slide-in { animation: fadeSlideIn .25s ease-out; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(-6px) scale(0.995); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">{mode === 'public' ? 'Cadastrar Comércio' : 'Clientes'}</h2>
      {mode !== 'public' && (
        <button onClick={() => setShowForm((v) => !v)} className="w-full mb-3 flex items-center justify-between px-4 py-3 rounded-md bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500">
          <span className="text-sm font-semibold">{showForm ? 'Fechar cadastro de comércio' : 'Cadastrar comércio'}</span>
          <span className="opacity-90"><Chevron open={showForm} /></span>
        </button>
      )}
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      {showForm && (
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 fade-slide-in shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="md:col-span-1 flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-slate-100 border border-slate-300 overflow-hidden mb-2">
              {fotoPreview ? <img src={fotoPreview} alt="Foto" className="w-full h-full object-cover" /> : <div className="w-full h-full" />}
            </div>
            <label className="text-xs text-slate-700 mb-1">Selecione uma foto</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setFotoFile(f);
                if (f) {
                  const reader = new FileReader();
                  reader.onload = () => setFotoPreview(String(reader.result || ''));
                  reader.readAsDataURL(f);
                } else {
                  setFotoPreview('');
                }
              }}
              className="text-xs"
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">Segmento</label>
              <select value={form.segmento} onChange={(e) => setForm({ ...form, segmento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
                <option value="">Selecione</option>
                <option>Comida Variada</option>
                <option>Hamburgueria</option>
                <option>Pizzaria</option>
                <option>Doces</option>
                <option>Bebidas</option>
                <option>Mercado</option>
                <option>Farmácia</option>
                <option>Outro</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-700">Data de Início</label>
              <input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-700">Razão Social</label>
              <input value={form.razao_social} onChange={(e) => setForm({ ...form, razao_social: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-slate-700">Nome Fantasia</label>
              <input value={form.nome_fantasia} onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>

            {mode !== 'public' && (
            <div className="md:col-span-2 mt-4 bg-sky-50 border border-sky-100 p-4 rounded-lg">
              <div className="mb-3 text-sm text-sky-800 font-medium">
                Precificação por Modal
              </div>
              <div className="text-xs text-sky-700 mb-3">
                Configure a tabela de preço específica para este cliente em cada modal.
                O valor será calculado automaticamente na criação da entrega.
              </div>
              <div className="space-y-4">
                {modais.map((m) => {
                  const modal = m.tipo;
                  const config = form.precificacao_config.find(c => c.modal === modal) || {
                    modal,
                    preco_ponto: '0.00',
                    tipo_precificacao: 'Distância',
                    tabela_id: ''
                  };
                  return (
                    <div key={modal} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-white rounded border border-sky-100">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Veículos</label>
                        <div className="w-full px-3 py-2 border border-slate-300 rounded bg-slate-100 text-slate-600 text-sm capitalize">
                          {modal}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Preço por Ponto</label>
                        <input 
                          type="number"
                          step="0.01"
                          value={config.preco_ponto} 
                          onChange={(e) => updateCreateConfig(modal, 'preco_ponto', e.target.value)} 
                          className="w-full px-3 py-2 border border-slate-300 rounded text-sm" 
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Tipo de precificação</label>
                        <select 
                          value={config.tipo_precificacao} 
                          onChange={(e) => updateCreateConfig(modal, 'tipo_precificacao', e.target.value)} 
                          className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                        >
                          <option value="Padrão">Padrão</option>
                          <option value="Zona">Zona</option>
                          <option value="Bairro">Bairro</option>
                          <option value="Distância">Distância</option>
                          <option value="Zerar">Zerar</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 block mb-1">Tabela de precificação</label>
                        <select 
                          value={config.tabela_id} 
                          onChange={(e) => updateCreateConfig(modal, 'tabela_id', e.target.value)} 
                          className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                          disabled={config.tipo_precificacao !== 'Distância'}
                        >
                          <option value="">Selecione...</option>
                          {tabelasPrecos.map(t => (
                            <option key={t.id} value={t.id}>{t.nome}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}
            {mode !== 'public' && (
            <div className="md:col-span-2 mt-0 bg-amber-50 border border-amber-100 p-4 rounded-lg">
              <div className="mb-1 text-sm text-amber-800 font-medium">Tabela de Comissão do Entregador</div>
              <div className="text-xs text-amber-700 mb-3">
                Define qual tabela de comissão o entregador recebe ao entregar para este comércio.
              </div>
              <select
                value={formTabelaComissaoId}
                onChange={e => setFormTabelaComissaoId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white"
              >
                <option value="">Sem tabela de comissão</option>
                {tabelasComissoes.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            )}
            <div>
              <label className="text-xs text-slate-700">Cadastro via</label>
              <select value={form.cadastro_via} onChange={(e) => setForm({ ...form, cadastro_via: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded">
                <option value="">Selecione</option>
                <option>Sistema do Comerciante</option>
                <option>App do Comerciante</option>
                <option>Painel Admin</option>
                <option>Importação</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-700">Tipo de documento</label>
              <div className="flex items-center gap-3 mt-1">
                <label className="text-xs"><input type="radio" checked={form.tipo_documento === 'cpf'} onChange={() => setForm({ ...form, tipo_documento: 'cpf' })} /> CPF</label>
                <label className="text-xs"><input type="radio" checked={form.tipo_documento === 'cnpj'} onChange={() => setForm({ ...form, tipo_documento: 'cnpj' })} /> CNPJ</label>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-700">CNPJ</label>
              <input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="text-xs text-slate-700">Franquias</label>
              <input value={form.franquia} onChange={(e) => setForm({ ...form, franquia: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="text-xs text-slate-700">Hubs</label>
              <input value={form.hub} onChange={(e) => setForm({ ...form, hub: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="text-xs text-slate-700">Lead cadastrado por</label>
              <input value={form.lead_por} onChange={(e) => setForm({ ...form, lead_por: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">CNPJ ou CPF</label>
            <input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <div className="text-[11px] text-slate-500 mt-1">Informe o CNPJ ou CPF do comércio ou pessoa</div>
          </div>
          <div>
            <label className="text-xs text-slate-700">Data de nascimento</label>
            <input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone / WhatsApp</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
        <div>
          <label className="text-xs text-slate-700">E-mail</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
        </div>
        <div>
          <label className="text-xs text-slate-700">Senha</label>
          <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
        </div>
          <div>
            <label className="text-xs text-slate-700">Método de pagamento preferido</label>
            <input value={form.metodo_pagamento_preferido} onChange={(e) => setForm({ ...form, metodo_pagamento_preferido: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Observações</label>
            <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
        </div>
        <div className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input placeholder="CEP" value={enderecoAtual.cep || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, cep: e.target.value })} onBlur={(e) => handleCepBlur(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Rua" value={enderecoAtual.rua || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Número" value={enderecoAtual.numero || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Complemento" value={enderecoAtual.complemento || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Bairro" value={enderecoAtual.bairro || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Cidade" value={enderecoAtual.cidade || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Referência de entrega" value={enderecoAtual.referencia_entrega || ''} onChange={(e) => setEnderecoAtual({ ...enderecoAtual, referencia_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
          </div>
          <button onClick={addEndereco} className="mt-3 px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm">Adicionar endereço</button>
          <button
            type="button"
            onClick={() => openPinPicker('create', [enderecoAtual.rua, enderecoAtual.numero, enderecoAtual.bairro, enderecoAtual.cidade, enderecoAtual.cep].filter(Boolean).join(', '))}
            className="mt-3 ml-2 px-3 py-2 rounded bg-slate-100 text-slate-700 text-sm border border-slate-300 hover:bg-slate-200"
          >
            📍 Ajustar localização no mapa
          </button>
          {(form.latitude && form.longitude) && (
            <span className="ml-2 text-xs text-emerald-600">Posição exata confirmada</span>
          )}
          {enderecos.length > 0 && (
            <div className="mt-3 space-y-2">
              {enderecos.map((e, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded">
                  <div className="text-sm text-slate-700">{[e.rua, e.numero, e.bairro, e.cidade].filter(Boolean).join(', ')}</div>
                  <button onClick={() => removeEndereco(i)} className="text-xs text-red-700">Remover</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-4">
          <button onClick={handleSubmit} disabled={loading} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Salvando...' : (mode === 'public' ? 'Cadastrar' : 'Salvar cliente')}
          </button>
        </div>
      </div>
      )}

      {mode !== 'public' && showForm && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6 fade-slide-in shadow-sm">
          <div className="text-sm font-medium text-slate-900 mb-2">Usuários adicionais do comércio</div>
          {newMembers.length === 0 ? (
            <div className="text-sm text-slate-600 mb-2">Nenhum usuário adicional</div>
          ) : (
            <div className="space-y-2 mb-3">
              {newMembers.map((u, i) => (
                <div key={`${u.email}-${i}`} className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded">
                  <div className="text-sm text-slate-700">{u.email}</div>
                  <button onClick={() => setNewMembers((prev) => prev.filter((_, idx) => idx !== i))} className="text-xs text-red-700">Remover</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">E-mail do usuário</label>
              <input type="email" value={newMemberEmailCreate} onChange={(e) => setNewMemberEmailCreate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="text-xs text-slate-700">Senha</label>
              <input type="password" value={newMemberPasswordCreate} onChange={(e) => setNewMemberPasswordCreate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={() => {
                const eml = (newMemberEmailCreate || '').trim().toLowerCase();
                const pwd = (newMemberPasswordCreate || '').trim();
                if (!eml || !pwd) { setError('Informe e-mail e senha do usuário'); return; }
                setNewMembers((prev) => [...prev, { email: eml, password: pwd }]);
                setNewMemberEmailCreate('');
                setNewMemberPasswordCreate('');
              }}
              className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm"
            >Adicionar usuário</button>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">Esses usuários serão criados após salvar o comércio</div>
        </div>
      )}

      {mode !== 'public' && (
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Lista de clientes</div>
        {loading ? (
          <div className="p-4 text-slate-600">Carregando...</div>
        ) : clientes.length === 0 ? (
          <div className="p-4 text-slate-600">Nenhum cliente cadastrado</div>
        ) : (
          <div className="divide-y">
            {clientes.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium text-slate-900">{c.nome_completo}</div>
                  <div className="text-sm text-slate-600">{[c.telefone, c.email].filter(Boolean).join(' • ')}</div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => openEdit(c)} className="text-sm text-sky-700">Editar</button>
                  <button onClick={() => handleDelete(c.id)} className="text-sm text-red-700">Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      <Modal
        open={Boolean(editing)}
        title="Editar cliente"
        onClose={() => setEditing(null)}
        onConfirm={handleUpdate}
        confirmDisabled={loading}
        maxWidth="max-w-4xl"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
          <div className="md:col-span-1 flex flex-col items-center">
            <div className="w-32 h-32 rounded-full bg-slate-100 border border-slate-300 overflow-hidden mb-2">
              {editFotoPreview || editForm.foto_url || editForm.foto_base64 ? (
                <img src={editFotoPreview || editForm.foto_url || editForm.foto_base64} alt="Foto" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full" />
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setEditFotoFile(f);
                if (f) {
                  const reader = new FileReader();
                  reader.onload = () => setEditFotoPreview(String(reader.result || ''));
                  reader.readAsDataURL(f);
                }
              }}
              className="text-xs w-full mt-2"
            />
          </div>
          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-700">Nome completo</label>
            <input value={editForm.nome_completo} onChange={(e) => setEditForm({ ...editForm, nome_completo: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">CNPJ ou CPF</label>
            <input value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
            <div className="text-[11px] text-slate-500 mt-1">Informe o CNPJ ou CPF do comércio ou pessoa</div>
          </div>
          <div>
            <label className="text-xs text-slate-700">Data de nascimento</label>
            <input type="date" value={editForm.data_nascimento} onChange={(e) => setEditForm({ ...editForm, data_nascimento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Telefone / WhatsApp</label>
            <input value={editForm.telefone} onChange={(e) => setEditForm({ ...editForm, telefone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">E-mail</label>
            <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
             <label className="text-xs text-slate-700">Nova Senha (opcional)</label>
             <input type="password" placeholder="Nova Senha" value={(editForm as any).nova_senha || ''} onChange={(e) => setEditForm({ ...editForm, nova_senha: e.target.value } as any)} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Método de pagamento preferido</label>
            <input value={editForm.metodo_pagamento_preferido} onChange={(e) => setEditForm({ ...editForm, metodo_pagamento_preferido: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>

          <div className="md:col-span-2 border-t border-slate-200 pt-4 mt-2">
             <div className="text-sm font-medium text-slate-900 mb-3">Configuração Financeira</div>
          </div>
          
          <div>
            <label className="text-xs text-slate-700 font-medium">Modo de Operação</label>
            <select 
               value={(editForm as any).modo_faturamento} 
               onChange={(e) => setEditForm({ ...editForm, modo_faturamento: e.target.value } as any)} 
               className="w-full px-3 py-2 border border-slate-300 rounded"
            >
               <option value="credito">Pré-pago (Crédito)</option>
               <option value="faturamento">Pós-pago (Faturamento)</option>
            </select>
          </div>

          {(editForm as any).modo_faturamento === 'faturamento' && (
            <>
               <div>
                  <label className="text-xs text-slate-700">Período de Faturamento</label>
                  <select 
                     value={(editForm as any).faturamento_periodo} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_periodo: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                     <option value="semanal">Semanal</option>
                     <option value="quinzenal">Quinzenal</option>
                     <option value="mensal">Mensal</option>
                  </select>
               </div>
               <div>
                  <label className="text-xs text-slate-700">Vencimento (dias após fechamento)</label>
                  <input 
                     type="number" 
                     value={(editForm as any).faturamento_vencimento_dias} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_vencimento_dias: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded" 
                  />
               </div>
               <div>
                  <label className="text-xs text-slate-700">Tipo de Cobrança</label>
                  <select 
                     value={(editForm as any).faturamento_tipo_cobranca} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_tipo_cobranca: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded"
                  >
                     <option value="Por Entregas">Por Entregas Realizadas</option>
                     <option value="Fixo">Valor Fixo Mensal</option>
                  </select>
               </div>
               <div>
                  <label className="text-xs text-slate-700">Taxa Adicional 1 (R$)</label>
                  <input 
                     type="number" step="0.01"
                     value={(editForm as any).faturamento_adicional_1} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_adicional_1: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded" 
                  />
               </div>
               <div>
                  <label className="text-xs text-slate-700">Taxa Adicional 2 (R$)</label>
                  <input 
                     type="number" step="0.01"
                     value={(editForm as any).faturamento_adicional_2} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_adicional_2: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded" 
                  />
               </div>
               <div className="flex items-center gap-2 mt-6">
                  <input 
                     type="checkbox" 
                     checked={(editForm as any).faturamento_cobrar_taxas_sem_entregas} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_cobrar_taxas_sem_entregas: e.target.checked } as any)} 
                     className="rounded border-slate-300"
                  />
                  <label className="text-xs text-slate-700">Cobrar taxas mesmo sem entregas</label>
               </div>
               <div className="md:col-span-2">
                  <label className="text-xs text-slate-700">Instruções de Pagamento</label>
                  <textarea 
                     rows={2}
                     value={(editForm as any).faturamento_instrucoes} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_instrucoes: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded" 
                  />
               </div>
               <div className="md:col-span-2">
                  <label className="text-xs text-slate-700">Observações do Faturamento</label>
                  <textarea 
                     rows={2}
                     value={(editForm as any).faturamento_observacoes} 
                     onChange={(e) => setEditForm({ ...editForm, faturamento_observacoes: e.target.value } as any)} 
                     className="w-full px-3 py-2 border border-slate-300 rounded" 
                  />
               </div>
               <div className="md:col-span-2">
                  <label className="text-xs text-slate-700">E-mails para Faturamento</label>
                  <div className="flex gap-2 mb-2">
                     <input 
                        type="email" 
                        placeholder="Adicionar e-mail"
                        value={(editForm as any).faturamento_email_input || ''}
                        onChange={(e) => setEditForm({ ...editForm, faturamento_email_input: e.target.value } as any)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded"
                     />
                     <button 
                        onClick={() => {
                           const email = ((editForm as any).faturamento_email_input || '').trim();
                           if (email) {
                              setEditForm(prev => ({
                                 ...prev,
                                 faturamento_emails: [...(prev as any).faturamento_emails, email],
                                 faturamento_email_input: ''
                              } as any));
                           }
                        }}
                        className="px-3 py-2 bg-slate-200 rounded text-slate-700 text-sm"
                     >Adicionar</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                     {((editForm as any).faturamento_emails || []).map((email: string, idx: number) => (
                        <div key={idx} className="bg-slate-100 px-2 py-1 rounded border border-slate-200 flex items-center gap-2 text-xs">
                           {email}
                           <button 
                              onClick={() => {
                                 setEditForm(prev => ({
                                    ...prev,
                                    faturamento_emails: (prev as any).faturamento_emails.filter((_: any, i: number) => i !== idx)
                                 } as any));
                              }}
                              className="text-red-500 font-bold"
                           >×</button>
                        </div>
                     ))}
                  </div>
               </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Observações</label>
            <textarea value={editForm.observacoes} onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2 border-t border-slate-200 pt-3 mt-1">
            <p className="text-xs font-semibold text-slate-600 mb-2">Google Maps (chave exclusiva desta loja)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-700">API Key do Google Maps</label>
                <input
                  value={(editForm as any).google_maps_api_key}
                  onChange={(e) => setEditForm({ ...editForm, google_maps_api_key: e.target.value } as any)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-slate-700">Map ID do Google Maps</label>
                <input
                  value={(editForm as any).google_maps_map_id}
                  onChange={(e) => setEditForm({ ...editForm, google_maps_map_id: e.target.value } as any)}
                  placeholder="da75f8800318c91f..."
                  className="w-full px-3 py-2 border border-slate-300 rounded font-mono text-xs"
                />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-1">Deixe em branco para usar a chave padrão do sistema. Recomendado configurar uma chave própria para separar os custos do Google Maps por loja.</p>
          </div>
          <div>
            <label className="text-xs text-slate-700">Segmento</label>
            <input value={editForm.segmento} onChange={(e) => setEditForm({ ...editForm, segmento: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Data de Início</label>
            <input type="date" value={editForm.data_inicio} onChange={(e) => setEditForm({ ...editForm, data_inicio: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Razão Social</label>
            <input value={editForm.razao_social} onChange={(e) => setEditForm({ ...editForm, razao_social: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-slate-700">Nome Fantasia</label>
            <input value={editForm.nome_fantasia} onChange={(e) => setEditForm({ ...editForm, nome_fantasia: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Cadastro via</label>
            <input value={editForm.cadastro_via} onChange={(e) => setEditForm({ ...editForm, cadastro_via: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Tipo de documento</label>
            <div className="flex items-center gap-3 mt-1">
              <label className="text-xs"><input type="radio" checked={editForm.tipo_documento === 'cpf'} onChange={() => setEditForm({ ...editForm, tipo_documento: 'cpf' })} /> CPF</label>
              <label className="text-xs"><input type="radio" checked={editForm.tipo_documento === 'cnpj'} onChange={() => setEditForm({ ...editForm, tipo_documento: 'cnpj' })} /> CNPJ</label>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-700">CNPJ</label>
            <input value={editForm.cnpj} onChange={(e) => setEditForm({ ...editForm, cnpj: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Franquias</label>
            <input value={editForm.franquia} onChange={(e) => setEditForm({ ...editForm, franquia: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Hubs</label>
            <input value={editForm.hub} onChange={(e) => setEditForm({ ...editForm, hub: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          <div>
            <label className="text-xs text-slate-700">Lead cadastrado por</label>
            <input value={editForm.lead_por} onChange={(e) => setEditForm({ ...editForm, lead_por: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded" />
          </div>
          </div>
        </div>

        {}
        <div className="mt-4 bg-sky-50 border border-sky-100 p-4 rounded-lg">
          <div className="mb-3 text-sm text-sky-800">
            Configure o tipo de precificação personalizada para o cliente. É necessário já ter a precificação cadastrada.
          </div>
          <div className="space-y-4">
            {modais.map((m) => {
              const modal = m.tipo;
              const config = editForm.precificacao_config.find(c => c.modal === modal) || {
                modal,
                preco_ponto: '0.00',
                tipo_precificacao: 'Distância',
                tabela_id: ''
              };

              const updateConfig = (field: keyof PrecificacaoConfigItem, value: string) => {
                setEditForm(prev => {
                  const existingIndex = prev.precificacao_config.findIndex(c => c.modal === modal);
                  let newConfig = [...prev.precificacao_config];
                  
                  if (existingIndex >= 0) {
                    newConfig[existingIndex] = { ...newConfig[existingIndex], [field]: value };
                  } else {
                    newConfig.push({ ...config, [field]: value });
                  }
                  
                  return { ...prev, precificacao_config: newConfig };
                });
              };

              return (
                <div key={modal} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Veículos</label>
                    <div className="w-full px-3 py-2 border border-slate-300 rounded bg-slate-100 text-slate-600 text-sm capitalize">
                      {modal}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Preço por Ponto</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={config.preco_ponto} 
                      onChange={(e) => updateConfig('preco_ponto', e.target.value)} 
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm" 
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Tipo de precificação</label>
                    <select 
                      value={config.tipo_precificacao} 
                      onChange={(e) => updateConfig('tipo_precificacao', e.target.value)} 
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                    >
                      <option value="Padrão">Padrão</option>
                      <option value="Zona">Zona</option>
                      <option value="Bairro">Bairro</option>
                      <option value="Distância">Distância</option>
                      <option value="Zerar">Zerar</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Tabela de precificação: {config.tipo_precificacao}</label>
                    <select 
                      value={config.tabela_id} 
                      onChange={(e) => updateConfig('tabela_id', e.target.value)} 
                      className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                      disabled={config.tipo_precificacao !== 'Distância'}
                    >
                      <option value="">Selecione...</option>
                      {tabelasPrecos.map(t => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 bg-amber-50 border border-amber-100 p-4 rounded-lg">
          <div className="mb-1 text-sm text-amber-800 font-medium">Tabela de Comissão do Entregador</div>
          <div className="text-xs text-amber-700 mb-3">
            Define qual tabela de comissão o entregador recebe ao entregar para este comércio.
          </div>
          <select
            value={editTabelaComissaoId}
            onChange={e => setEditTabelaComissaoId(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white"
          >
            <option value="">Sem tabela de comissão</option>
            {tabelasComissoes.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>

        <div className="mt-4 bg-indigo-50 border border-indigo-100 p-4 rounded-lg">
          <div className="mb-1 text-sm text-indigo-800 font-medium">Limite de Entregas Simultâneas por Entregador</div>
          <div className="text-xs text-indigo-700 mb-3">
            Define quantas entregas deste comércio cada entregador pode ter em andamento ao mesmo tempo. "Todos" cria uma regra padrão; entregadores específicos sobrepõem a regra padrão.
          </div>
          {editLimites.length > 0 && (
            <div className="space-y-2 mb-3">
              {editLimites.map((rule, i) => (
                <div key={rule.id || `lim-${i}`} className="flex items-center gap-2 bg-white border border-indigo-200 rounded px-3 py-2">
                  <div className="flex-1 text-sm text-slate-700">
                    {rule.entregador_id === null
                      ? 'Todos os entregadores'
                      : (rule.entregador_nome || entregadoresList.find(e => e.id === rule.entregador_id)?.nome_completo || rule.entregador_id)}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={rule.limite}
                    onChange={(e) => setEditLimites(prev => prev.map((r, idx) => idx === i ? { ...r, limite: Math.max(1, Number(e.target.value)) } : r))}
                    className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center"
                  />
                  <span className="text-xs text-slate-500 whitespace-nowrap">entrega(s)</span>
                  <button
                    onClick={() => {
                      if (rule.id) setEditLimitesRemovidos(prev => [...prev, rule.id!]);
                      setEditLimites(prev => prev.filter((_, idx) => idx !== i));
                    }}
                    className="text-xs text-red-600 hover:text-red-800 whitespace-nowrap"
                  >Remover</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <select
              value={limiteNovoEntregadorId}
              onChange={e => setLimiteNovoEntregadorId(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="todos">Todos os entregadores</option>
              {entregadoresList
                .filter(e => !editLimites.some(r => r.entregador_id === e.id))
                .map(e => <option key={e.id} value={e.id}>{e.nome_completo}</option>)
              }
            </select>
            <input
              type="number"
              min={1}
              max={20}
              value={limiteNovoValor}
              onChange={e => setLimiteNovoValor(Math.max(1, Number(e.target.value)))}
              className="w-16 px-2 py-1 border border-slate-300 rounded text-sm text-center"
            />
            <span className="text-xs text-slate-500 whitespace-nowrap">entrega(s)</span>
            <button
              onClick={() => {
                const entregadorId = limiteNovoEntregadorId === 'todos' ? null : limiteNovoEntregadorId;
                if (editLimites.some(r => r.entregador_id === entregadorId)) return;
                const entregadorNome = entregadorId ? entregadoresList.find(e => e.id === entregadorId)?.nome_completo : undefined;
                setEditLimites(prev => [...prev, { entregador_id: entregadorId, limite: limiteNovoValor, entregador_nome: entregadorNome }]);
                setLimiteNovoEntregadorId('todos');
                setLimiteNovoValor(1);
              }}
              className="px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm whitespace-nowrap"
            >Adicionar</button>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Localização do comércio (GPS)</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">Latitude</label>
              <input
                type="number"
                step="0.0000001"
                placeholder="-23.550520"
                value={(editForm as any).latitude}
                onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value } as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
            <div>
              <label className="text-xs text-slate-700">Longitude</label>
              <input
                type="number"
                step="0.0000001"
                placeholder="-46.633308"
                value={(editForm as any).longitude}
                onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value } as any)}
                className="w-full px-3 py-2 border border-slate-300 rounded"
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Preencha para fixar a localização do comércio no mapa. Se vazio, o sistema continua tentando localizar pelo endereço.
          </div>
          <button
            type="button"
            onClick={() => {
              const e = editEnderecos[0] || editEnderecoNovo;
              openPinPicker('edit', [e?.rua, e?.numero, e?.bairro, e?.cidade, e?.cep].filter(Boolean).join(', '));
            }}
            className="mt-2 px-3 py-2 rounded bg-slate-100 text-slate-700 text-sm border border-slate-300 hover:bg-slate-200"
          >
            📍 Ajustar localização no mapa
          </button>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Endereços</div>
          {editEnderecos.length === 0 ? (
            <div className="text-sm text-slate-600 mb-2">Nenhum endereço cadastrado</div>
          ) : (
            <div className="space-y-3">
              {editEnderecos.map((e, i) => (
                <div key={e.id || `novo-${i}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-slate-200 rounded p-3">
                  <input placeholder="CEP" value={e.cep || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, cep: ev.target.value } : x))} onBlur={(ev) => handleEditExistingCepBlur(i, ev.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Rua" value={e.rua || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, rua: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Número" value={e.numero || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, numero: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Complemento" value={e.complemento || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, complemento: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Bairro" value={e.bairro || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, bairro: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Cidade" value={e.cidade || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, cidade: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded" />
                  <input placeholder="Referência de entrega" value={e.referencia_entrega || ''} onChange={(ev) => setEditEnderecos((prev) => prev.map((x, idx) => idx === i ? { ...x, referencia_entrega: ev.target.value } : x))} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
                  <div className="md:col-span-3 flex justify-end">
                    <button
                      onClick={() => {
                        setEditEnderecos((prev) => prev.filter((_, idx) => idx !== i));
                        if (e.id) setEditEnderecosRemovidos((prev) => [...prev, e.id as string]);
                      }}
                      className="text-sm text-red-700"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <input placeholder="CEP" value={editEnderecoNovo.cep || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, cep: e.target.value })} onBlur={(e) => handleEditNewCepBlur(e.target.value)} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Rua" value={editEnderecoNovo.rua || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, rua: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Número" value={editEnderecoNovo.numero || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, numero: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Complemento" value={editEnderecoNovo.complemento || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, complemento: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Bairro" value={editEnderecoNovo.bairro || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, bairro: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Cidade" value={editEnderecoNovo.cidade || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, cidade: e.target.value })} className="px-3 py-2 border border-slate-300 rounded" />
            <input placeholder="Referência de entrega" value={editEnderecoNovo.referencia_entrega || ''} onChange={(e) => setEditEnderecoNovo({ ...editEnderecoNovo, referencia_entrega: e.target.value })} className="px-3 py-2 border border-slate-300 rounded md:col-span-3" />
          </div>
          <button
            onClick={() => {
              setEditEnderecos((prev) => [...prev, { ...editEnderecoNovo }]);
              setEditEnderecoNovo({ cep: '', rua: '', numero: '', complemento: '', bairro: '', cidade: '', referencia_entrega: '' });
            }}
            className="mt-3 px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm"
          >
            Adicionar endereço
          </button>
        </div>
        <div className="mt-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Usuários do comércio</div>
          {editMembers.length === 0 ? (
            <div className="text-sm text-slate-600 mb-2">Nenhum usuário vinculado</div>
          ) : (
            <div className="space-y-2 mb-3">
              {editMembers.map((u) => (
                <div key={u.id} className="flex items-center justify-between px-3 py-2 border border-slate-200 rounded">
                  <div className="text-sm text-slate-700">{u.email}</div>
                  <button
                    onClick={async () => {
                      await (supabase as unknown as { from: (t: string) => { delete: () => { eq: (c: string, v: unknown) => Promise<unknown> } } }).from('users').delete().eq('id', u.id);
                      
                      if (u.email) {
                        try {
                          await supabase.functions.invoke('delete-auth-user-by-email', { body: { email: u.email } });
                        } catch (e) {
                          console.warn('Erro ao deletar login do usuário removido:', e);
                        }
                      }
                      setEditMembers((prev) => prev.filter((x) => x.id !== u.id));
                    }}
                    className="text-xs text-red-700"
                  >Remover</button>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-700">E-mail do usuário</label>
              <input type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
            <div>
              <label className="text-xs text-slate-700">Senha</label>
              <input type="password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded" />
            </div>
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={async () => {
                if (!editing) return;
                const eml = (newMemberEmail || '').trim().toLowerCase();
                const pwd = (newMemberPassword || '').trim();
                if (!eml || !pwd) { setError('Informe e-mail e senha do usuário'); return; }
                setLoading(true);
                try {
                  const { data: su, error: se } = await supabase.auth.signUp({ email: eml, password: pwd });
                  if (se) throw se;
                  const uid = su?.user?.id || undefined;
                  await (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } }).from('users').upsert({ id: uid, email: eml, full_name: editing.nome_completo, role: 'cliente', cliente_id: editing.id });
                  setEditMembers((prev) => [...prev, { id: String(uid || eml), email: eml }]);
                  setNewMemberEmail('');
                  setNewMemberPassword('');
                } catch (e: any) {
                  const msg = e?.message || 'Falha ao criar usuário';
                  setError(msg);
                } finally {
                  setLoading(false);
                }
              }}
              className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm"
            >Adicionar usuário</button>
          </div>
        </div>
      </Modal>

      {pinPicker && (
        <AddressPinPicker
          addressText={pinPicker.addressText}
          onConfirm={handleConfirmPin}
          onCancel={() => setPinPicker(null)}
        />
      )}
    </div>
  );
}
  const sbInsert = (table: string, values: any) => supabase.from(table as any).insert(values).select().single();
