import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Cadastro } from './Cadastro';
import { AccountUnderAnalysis } from './AccountUnderAnalysis';
import { Key, Eye, EyeOff, CheckCircle, Mail, ArrowLeft, Store, Bike, MapPin } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export function AuthPage({ forceResetMode = false, onResetComplete }: { forceResetMode?: boolean; onResetComplete?: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupType, setSignupType] = useState<'cliente' | 'entregador' | ''>('');
  
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetPasswordMode, setResetPasswordMode] = useState(forceResetMode);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');
  const [accountPending, setAccountPending] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const isComercioLogin = typeof window !== 'undefined' && window.location.pathname === '/comercio';

  useEffect(() => {
    if (forceResetMode) {
        setResetPasswordMode(true);
    }
  }, [forceResetMode]);

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
    if (!newPassword || newPassword.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres');
        return;
    }
    if (newPassword !== confirmNewPassword) {
        setError('As senhas não coincidem');
        return;
    }

    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setResetPasswordMode(false);
      setForgotPasswordOpen(false);
      setResetMessage('Senha atualizada com sucesso! Faça login com a nova senha.');
      setNewPassword('');
      setConfirmNewPassword('');
      if (onResetComplete) onResetComplete();
    } catch (e: any) {
      setError(e.message || 'Erro ao atualizar senha');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const withTimeout = async <T,>(p: PromiseLike<T>, timeoutMs: number): Promise<T> => {
        let timer: number | undefined;
        try {
          return await Promise.race<T>([
            Promise.resolve(p as unknown as T),
            new Promise<T>((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('AUTH_SIGNIN_TIMEOUT')), timeoutMs);
            }),
          ]);
        } finally {
          if (timer) window.clearTimeout(timer);
        }
      };

      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: password.trim(),
        }),
        12000
      );
      if (signInError) throw signInError;

      const hasSessionUser = Boolean((data as any)?.session?.user);
      if (!hasSessionUser) {
        const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 6000);
        if (!sessionData?.session?.user) {
          throw new Error('Não foi possível iniciar a sessão. Tente novamente.');
        }
      }

      if (remember) {
        
      }
    } catch (e: any) {
      let msg = e?.message || 'Falha no login';
      if (/email not confirmed/i.test(msg)) msg = 'Você precisa confirmar seu e-mail primeiro para logar';
      if (/AUTH_SIGNIN_TIMEOUT/i.test(msg) || /timeout/i.test(msg)) {
        msg = 'O login demorou demais para responder. Verifique sua internet e tente novamente.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpStart = (type: 'comercio' | 'entregador') => {
    if (isNative) {
      setSignupType(type === 'comercio' ? 'cliente' : 'entregador');
      setSignupOpen(true);
      setError(null);
    } else {
      window.open(`/#${type}`, '_blank');
    }
  };

  if (accountPending) {
    return (
      <div className={`h-screen overflow-y-auto ${isNative ? 'bg-slate-900' : 'bg-slate-100'}`}>
        <div className="min-h-full flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow border border-slate-200 p-8">
            <AccountUnderAnalysis 
              isLoginAttempt 
              onBack={() => setAccountPending(false)} 
            />
          </div>
        </div>
      </div>
    );
  }

  const formContent = (
          <div className="p-8 md:p-10">
            <h2 className="text-2xl font-semibold text-slate-900 mb-1">
              {resetPasswordMode ? 'Nova Senha' : forgotPasswordOpen ? 'Recuperar Senha' : isComercioLogin ? 'Entrar na sua loja' : 'Entrar'}
            </h2>
            {isComercioLogin && !resetPasswordMode && !forgotPasswordOpen && (
              <p className="text-sm text-slate-500 mb-5">Use o e-mail e a senha da sua loja.</p>
            )}
            {(!isComercioLogin || resetPasswordMode || forgotPasswordOpen) && <div className="mb-5" />}
            {error && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>
            )}
            {resetMessage && (
              <div className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{resetMessage}</div>
            )}

            {resetPasswordMode ? (
              <div className="space-y-6">
                <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Key className="w-8 h-8 text-sky-600" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900">Redefinir Senha</h3>
                    <p className="text-sm text-slate-500 mt-1">Crie uma nova senha segura para sua conta</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Nova Senha</label>
                    <div className="relative">
                        <input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full pl-3 pr-10 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                            placeholder="Mínimo 6 caracteres"
                        />
                        <button 
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                            {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirmar Senha</label>
                    <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="Repita a nova senha"
                    />
                  </div>
                </div>

                <button
                  onClick={handleUpdatePassword}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-lg shadow-sky-200 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                      'Atualizando...'
                  ) : (
                      <>
                        <CheckCircle size={20} />
                        Atualizar Senha
                      </>
                  )}
                </button>
                <div className="text-center pt-2">
                  <button onClick={() => setResetPasswordMode(false)} className="text-sm text-slate-500 hover:text-slate-800 font-medium flex items-center justify-center gap-2 mx-auto">
                     <ArrowLeft size={16} />
                     Voltar para Login
                  </button>
                </div>
              </div>
            ) : forgotPasswordOpen ? (
              <div className="space-y-6">
                <div className="text-center mb-4">
                    <div className="w-12 h-12 bg-sky-50 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Mail className="w-6 h-6 text-sky-500" />
                    </div>
                    <p className="text-sm text-slate-600">Digite seu e-mail para receber um link de redefinição de senha.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
                  <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        placeholder="seu@email.com"
                      />
                  </div>
                </div>

                <button
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold disabled:opacity-50 transition-all shadow-md"
                >
                  {loading ? 'Enviando...' : 'Enviar Link de Recuperação'}
                </button>
                <div className="text-center">
                  <button onClick={() => setForgotPasswordOpen(false)} className="text-sm text-sky-600 hover:underline font-medium">Voltar para Login</button>
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
                {isComercioLogin ? (
                  <div className="mt-6 pt-5 border-t border-slate-100 text-center">
                    <p className="text-sm text-slate-500 mb-3">Ainda não trabalha com a gente?</p>
                    <button
                      onClick={() => handleSignUpStart('comercio')}
                      className="w-full px-4 py-2.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-md shadow-orange-200 transition-colors"
                    >
                      Cadastre sua Loja
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 text-center flex flex-col items-center gap-2 mt-4">
                    <span>Novo por aqui?</span>
                    <div className="flex gap-4">
                      <button onClick={() => handleSignUpStart('comercio')} className="text-sky-600 hover:underline font-medium">Cadastrar Comércio</button>
                      <span className="text-slate-300">|</span>
                      <button onClick={() => handleSignUpStart('entregador')} className="text-sky-600 hover:underline font-medium">Cadastrar Entregador</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
  );

  const signupModal = signupOpen && (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900">
      <Cadastro onBack={() => setSignupOpen(false)} darkMode={true} initialType={signupType} />
    </div>
  );

  // Login dedicado do comerciante (rota /comercio no navegador): tela inspirada na
  // identidade Route Delivery — fundo de mapa escuro, chamada comercial e rota animada.
  if (isComercioLogin && !isNative) {
    return (
      <div className="min-h-screen w-full overflow-y-auto bg-[#0b1b34] relative">
        <style>{`
          @keyframes rd-dash { to { stroke-dashoffset: -340; } }
          @keyframes rd-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
          .rd-route { stroke-dasharray: 10 14; animation: rd-dash 6s linear infinite; }
          .rd-float { animation: rd-float 3.5s ease-in-out infinite; }
        `}</style>

        {/* Fundo: grade de mapa */}
        <div className="absolute inset-0 opacity-[0.18]" style={{
          backgroundImage: 'linear-gradient(#2b4a7a 1px, transparent 1px), linear-gradient(90deg, #2b4a7a 1px, transparent 1px)',
          backgroundSize: '64px 64px'
        }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(1200px 600px at 20% 10%, rgba(37,99,235,0.18), transparent 60%)' }} />

        {/* Logo topo-esquerda */}
        <div className="relative z-10 flex items-center gap-3 px-6 md:px-10 pt-6">
          <img src="/Screenshot_20251113_103247-Photoroom.png" alt="Route Delivery" className="h-12 md:h-14 object-contain" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 md:px-10 pb-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center min-h-[calc(100vh-88px)]">
          {/* Coluna esquerda: chamada + rota animada */}
          <div className="text-white">
            <h1 className="text-3xl md:text-5xl font-extrabold leading-tight">
              Sua loja chamando<br />entregador em segundos.
            </h1>
            <ul className="mt-6 space-y-3 text-slate-200 text-sm md:text-base">
              {[
                'Lance a entrega e veja o valor na hora',
                'Acompanhe o motoboy no mapa até o cliente',
                'Faturas e histórico de entregas sempre à mão',
              ].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>

            {/* Ilustração da rota: loja → moto → destino */}
            <div className="mt-10 relative h-56 hidden sm:block">
              <svg viewBox="0 0 520 220" className="w-full h-full">
                <path d="M70 180 C 180 180, 150 70, 260 110 S 420 120, 450 30"
                  fill="none" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" className="rd-route" />
              </svg>
              {/* Loja (origem) */}
              <div className="rd-float absolute left-[6%] bottom-[8%] w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-900/40">
                <Store className="w-6 h-6 text-white" />
              </div>
              {/* Moto (a caminho) */}
              <div className="rd-float absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-sky-500 flex items-center justify-center shadow-lg shadow-sky-900/50" style={{ animationDelay: '0.6s' }}>
                <Bike className="w-8 h-8 text-white" />
              </div>
              {/* Destino */}
              <div className="rd-float absolute right-[8%] top-[2%] w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-900/40" style={{ animationDelay: '1.2s' }}>
                <MapPin className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          {/* Coluna direita: card de login */}
          <div className="w-full max-w-md justify-self-center lg:justify-self-end">
            <div className="bg-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
              <div className="flex items-center gap-3 px-8 pt-7">
                <img src="/Screenshot_20251113_103247-Photoroom.png" alt="Route Delivery" className="h-10 w-10 object-contain" />
                <div>
                  <div className="font-bold text-slate-900 leading-tight">Route Delivery</div>
                  <div className="text-xs text-slate-500">Sistema do comerciante</div>
                </div>
              </div>
              {formContent}
            </div>
          </div>
        </div>
        {signupModal}
      </div>
    );
  }

  return (
    <div className={`h-screen overflow-y-auto ${isNative ? 'bg-slate-900' : 'bg-slate-100'}`}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow border border-slate-200 overflow-hidden grid grid-cols-1 md:grid-cols-2">
          <div className="relative p-8 md:p-10 bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white">
            <div className="absolute inset-0 bg-black/20" />
            <div className="flex items-center justify-center mb-6">
              <img
                src={isNative ? "/iconeentregador.png" : "/Screenshot_20251113_103247-Photoroom.png"}
                alt="RouteDelivery"
                className="h-28 md:h-48 object-contain"
              />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold">Bem-vindo de volta!</h1>
            <p className="mt-2 text-slate-100">Acesse sua conta para continuar</p>
          </div>
          {formContent}
        </div>
      </div>
      {signupModal}
    </div>
  );
}
