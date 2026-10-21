import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Cadastro } from './Cadastro';
import { AccountUnderAnalysis } from './AccountUnderAnalysis';
import { Key, Eye, EyeOff, CheckCircle, Mail, ArrowLeft } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import './LoginComercioV1.css';

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

  // Login dedicado do comerciante (rota /comercio no navegador): PORTE FIEL do V1
  // (comerciante/src/pages/Login.jsx). Capa com mapa SVG, rota animada e cartão.
  // Recuperação/redefinição de senha caem no layout padrão abaixo.
  if (isComercioLogin && !isNative && !resetPasswordMode && !forgotPasswordOpen) {
    return (
      <>
      <div className="rd-login-v1 acesso">
        <div className="acesso-capa" aria-hidden="true">
          <svg className="capa-mapa" viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="capa-fundo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0b1628" />
                <stop offset="0.55" stopColor="#10284a" />
                <stop offset="1" stopColor="#123a6b" />
              </linearGradient>
              <radialGradient id="capa-brilho" cx="0.72" cy="0.3" r="0.6">
                <stop offset="0" stopColor="#2a78d6" stopOpacity="0.45" />
                <stop offset="1" stopColor="#2a78d6" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="800" height="800" fill="url(#capa-fundo)" />
            <rect width="800" height="800" fill="url(#capa-brilho)" />
            <g fill="#ffffff" fillOpacity="0.035">
              {Array.from({ length: 7 }).map((_, i) =>
                Array.from({ length: 7 }).map((__, j) => (
                  <rect key={`${i}-${j}`} x={20 + i * 115 + (j % 2) * 18} y={20 + j * 115} width={88} height={88} rx={10} />
                ))
              )}
            </g>
            <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="14" fill="none" strokeLinecap="round">
              <path d="M-20 250 C 180 230, 330 300, 520 260 S 760 200, 840 230" />
              <path d="M-20 560 C 160 600, 360 520, 560 560 S 760 640, 840 600" />
              <path d="M230 -20 C 250 200, 190 420, 260 620 S 300 760, 290 840" />
              <path d="M600 -20 C 570 180, 640 380, 590 560 S 560 760, 580 840" />
            </g>
            <path className="capa-rota" d="M140 585 C 220 560, 250 480, 330 440 S 470 410, 520 330 S 600 230, 650 215"
              stroke="#4da3ff" strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray="4 14" />
            <g transform="translate(140 585)">
              <circle r="26" fill="#ea580c" fillOpacity="0.18" />
              <rect x="-15" y="-15" width="30" height="30" rx="8" fill="#ea580c" stroke="#fff" strokeWidth="3" />
              <path d="M-7 -3h14M-7 -3l2-6h10l2 6M-6 -3v10h12v-10" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round" />
            </g>
            <g transform="translate(650 215)">
              <circle className="capa-pulso" r="34" fill="#22c55e" fillOpacity="0.2" />
              <path d="M0 16 C -14 2, -16 -4, -16 -10 A16 16 0 0 1 16 -10 C 16 -4, 14 2, 0 16 Z" fill="#22c55e" stroke="#fff" strokeWidth="3" />
              <circle cy="-10" r="5" fill="#fff" />
            </g>
            <g transform="translate(424 398)">
              <circle r="30" fill="#2a78d6" stroke="#fff" strokeWidth="4" />
              <g stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(-14 -10)">
                <circle cx="5" cy="17" r="4.5" />
                <circle cx="23" cy="17" r="4.5" />
                <path d="M5 17h8l5-8h5M13 17l-3-7h-5M18 9l-2-5h-3" />
              </g>
            </g>
          </svg>
          <div className="capa-texto">
            <img src="/logo-route-delivery.png" alt="Route Delivery" className="capa-logo" />
            <h2>Sua loja chamando entregador em segundos.</h2>
            <ul>
              <li>Lance a entrega e veja o valor na hora</li>
              <li>Acompanhe o motoboy no mapa até o cliente</li>
              <li>Faturas e histórico de entregas sempre à mão</li>
            </ul>
          </div>
        </div>
        <div className="acesso-cartao">
          <div className="marca marca-acesso">
            <span className="marca-selo" aria-hidden="true"><img src="/logo-leao.png" alt="" /></span>
            <div>
              <strong>Route Delivery</strong>
              <small>Sistema do comerciante</small>
            </div>
          </div>
          <h1>Entrar na sua loja</h1>
          <p className="subtitulo">Use o e-mail e a senha da sua loja.</p>
          <form onSubmit={(e) => { e.preventDefault(); handleSignIn(); }} className="form-acesso">
            <label className="campo">
              <span className="campo-rotulo">E-mail</span>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            <label className="campo">
              <span className="campo-rotulo">Senha</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <div className="erro-caixa" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primario btn-bloco" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
            <p className="apagado centro" style={{ fontSize: 12, margin: 0 }}>Esqueceu a senha? Fale com a equipe Route Delivery.</p>
          </form>
          <div className="cadastre-loja">
            <span>Ainda não trabalha com a gente?</span>
            <button
              type="button"
              className="btn btn-laranja btn-bloco"
              onClick={() => { setError(null); setSignupType('cliente'); setSignupOpen(true); }}
            >
              Cadastre sua Loja
            </button>
          </div>
        </div>
      </div>
      {signupModal}
      </>
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
