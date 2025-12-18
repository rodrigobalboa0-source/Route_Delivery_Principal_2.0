import React from 'react';

interface AccountUnderAnalysisProps {
  onBack: () => void;
  isLoginAttempt?: boolean;
}

export function AccountUnderAnalysis({ onBack, isLoginAttempt = false }: AccountUnderAnalysisProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
      <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mb-6">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-3">
        {isLoginAttempt ? 'Acesso em Análise' : 'Cadastro Recebido!'}
      </h2>
      <p className="text-slate-600 max-w-md mb-8">
        {isLoginAttempt 
          ? 'Sua conta ainda está em processo de análise. Por favor, aguarde a aprovação da nossa equipe para acessar o aplicativo.'
          : 'Seus dados foram enviados com sucesso. Nossa equipe analisará seu cadastro e em breve você poderá acessar o aplicativo.'}
      </p>
      <button
        onClick={onBack}
        className="px-6 py-3 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors"
      >
        Voltar ao Início
      </button>
    </div>
  );
}
