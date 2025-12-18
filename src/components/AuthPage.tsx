import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Cadastro } from './Cadastro';

export function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const isNative = window.Capacitor?.isNativePlatform();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setResetPasswordMode(true);
      }
    });
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Digite seu e-mail para recuperar a senha');
      return;
    }
    setLoading(true);
    setError(null);
    setResetMessage('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: isNative 
           ? 'io.ionic.starter://reset-callback' 
           : window.location.origin
      });
      if (error) throw error;
      setResetMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (e: any) {
      setError(e.message || 'Erro ao enviar e-mail');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetPasswordMode(false);
      setForgotPasswordOpen(false);
      setResetMessage('Senha atualizada com sucesso! Faça login com a nova senha.');
      setNewPassword('');
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) throw signInError;

      if (data?.user?.email) {
        const { data: entregador } = await supabase
          .from('entregadores')
          .select('status')
          .ilike('email', data.user.email)
          .maybeSingle();

        if (entregador && (entregador.status === 'em_analise' || entregador.status === 'inativo')) {
          await supabase.auth.signOut();
          throw new Error('Seu acesso está em análise ou inativo. Aguarde aprovação.');
        }
      }

      if (remember) {
        // Implement remember me logic if needed
      }
    } catch (e: any) {
      let msg = e.message || 'Falha no login';
      if (/email not confirmed/i.test(msg)) msg = 'Você precisa confirmar seu e-mail primeiro para logar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpStart = () => {
    if (isNative) {
      setSignupOpen(true);
      setError(null);
    } else {
      window.open('/#cadastro', '_blank');
    }
  };

  return (
    <div className={`h-screen overflow-y-auto ${isNative ? 'bg-slate-900' : 'bg-slate-100'}`}>
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
            <h2 className="text-2xl font-semibold text-slate-900 mb-6">
              {resetPasswordMode ? 'Nova Senha' : forgotPasswordOpen ? 'Recuperar Senha' : 'Entrar'}
            </h2>
            {error && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
            )}
            {resetMessage && (
              <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{resetMessage}</div>
            )}

            {resetPasswordMode ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nova Senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Nova senha segura"
                  />
                </div>
                <button
                  onClick={handleUpdatePassword}
                  disabled={loading}
                  className="w-full px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50"
                >
                  {loading ? 'Atualizando...' : 'Atualizar Senha'}
                </button>
                <div className="text-center">
                  <button onClick={() => setResetPasswordMode(false)} className="text-xs text-slate-500 hover:text-slate-700">Voltar para Login</button>
                </div>
              </div>
            ) : forgotPasswordOpen ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Digite seu e-mail para receber um link de redefinição de senha.</p>
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
                <button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="w-full px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Enviar Link'}
                </button>
                <div className="text-center">
                  <button onClick={() => setForgotPasswordOpen(false)} className="text-xs text-sky-600 hover:underline">Voltar para Login</button>
                </div>
              </div>
            ) : (
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
                  <button onClick={() => setForgotPasswordOpen(true)} className="hover:underline">Esqueceu a senha?</button>
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
            )}
          </div>
        </div>
      </div>
      {signupOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900">
          <Cadastro onBack={() => setSignupOpen(false)} darkMode={true} />
        </div>
      )}
    </div>
  );
}
