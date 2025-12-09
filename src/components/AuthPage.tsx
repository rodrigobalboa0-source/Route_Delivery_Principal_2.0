import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupRole, setSignupRole] = useState<'entregador' | 'cliente' | ''>('');
  const [signupNome, setSignupNome] = useState('');
  const [signupTelefone, setSignupTelefone] = useState('');

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      if (remember) {
        void 0;
      }
    } catch (e: unknown) {
      let msg = (e as { message?: string })?.message || 'Falha no login';
      if (/email not confirmed/i.test(msg)) msg = 'Você precisa confirmar seu e-mail primeiro para logar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpStart = () => {
    try {
      window.open('/#cadastro', '_blank');
    } catch {
      setSignupOpen(true);
      setSignupRole('');
      setSignupNome('');
      setSignupTelefone('');
      setError(null);
    }
  };

  const handleSignUpConfirm = async () => {
    if (!email || !password || !signupRole || !signupNome) { setError('Preencha e-mail, senha, tipo e nome'); return; }
    setLoading(true);
    setError(null);
    try {
      const eml = email.trim().toLowerCase();
      const { data, error: signUpError } = await supabase.auth.signUp({ email: eml, password });
      if (signUpError) throw signUpError;
      const uid = data?.user?.id || '';
      if (signupRole === 'cliente') {
        await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
          .from('clientes')
          .insert({ nome_completo: signupNome, email: eml, telefone: signupTelefone || null });
      } else if (signupRole === 'entregador') {
        await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } })
          .from('entregadores')
          .insert({ nome_completo: signupNome, email: eml, telefone: signupTelefone || null, status: 'ativo' });
      }
      void (supabase as unknown as { from: (t: string) => { upsert: (v: unknown) => Promise<unknown> } })
        .from('users')
        .upsert({ id: uid || undefined, email: eml, full_name: signupNome, role: signupRole });
      setSignupOpen(false);
    } catch (e: unknown) {
      let msg = (e as { message?: string })?.message || 'Falha no cadastro';
      if (/email not confirmed/i.test(msg)) msg = 'Você precisa confirmar seu e-mail primeiro para logar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-slate-100">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow border border-slate-200 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        <div className="relative p-8 md:p-10 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
          <div className="absolute inset-0 bg-black/20" />
          <div className="flex items-center justify-center mb-6">
            <img
              src="/Screenshot_20251113_103247-Photoroom.png"
              alt="RouteDelivery"
              className="h-20 md:h-24 object-contain"
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">Bem-vindo de volta!</h1>
          <p className="mt-2 text-slate-100">Acesse sua conta para continuar</p>
          
        </div>
        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-slate-900 mb-6">Entrar</h2>
          {error && (
            <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="••••••••"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Lembrar-me
              </label>
              <button className="hover:underline">Esqueceu a senha?</button>
            </div>
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <div className="text-xs text-slate-600 text-center">
              Novo por aqui?{' '}
              <button onClick={handleSignUpStart} className="text-sky-600 hover:underline">Criar uma conta</button>
            </div>
          </div>
        </div>
      </div>
      </div>
      {signupOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-xl shadow p-6">
            <div className="text-lg font-semibold text-slate-900 mb-2">Criar conta</div>
            <div className="text-sm text-slate-600 mb-4">Escolha o tipo de conta e informe seus dados</div>
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" checked={signupRole==='cliente'} onChange={() => setSignupRole('cliente')} /> Comercio</label>
                <label className="flex items-center gap-2"><input type="radio" checked={signupRole==='entregador'} onChange={() => setSignupRole('entregador')} /> Entregador</label>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nome completo</label>
                <input value={signupNome} onChange={(e) => setSignupNome(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
                <input value={signupTelefone} onChange={(e) => setSignupTelefone(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-2">
                <button onClick={() => setSignupOpen(false)} className="px-3 py-2 rounded bg-slate-200 text-slate-800 text-sm">Cancelar</button>
                <button onClick={handleSignUpConfirm} disabled={loading} className="px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">Criar</button>
              </div>
              <div className="text-[11px] text-slate-500">Após criar, confirme seu e-mail para poder acessar</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
