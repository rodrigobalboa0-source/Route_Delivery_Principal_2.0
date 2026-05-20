import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Cadastro } from './components/Cadastro';
import './index.css';


window.onerror = function(message, source, lineno, colno, error) {
  
  if (typeof message === 'string' && message.toLowerCase().includes('script error') && !error) {
    console.warn('Ignored generic Script Error:', message);
    return;
  }
  
  
  if (typeof message === 'string' && (message.includes('WebGL') || message.includes('context'))) {
      console.warn('Ignored WebGL Error:', message);
      return;
  }

  console.error('Global Error:', message, error);
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: white; color: red; z-index: 9999; padding: 20px; overflow: auto; font-family: monospace;';
  errorDiv.innerHTML = `
    <h1>Erro Detectado</h1>
    <p><strong>Mensagem:</strong> ${message}</p>
    <p><strong>Local:</strong> ${source}:${lineno}:${colno}</p>
    <pre style="background: #f0f0f0; padding: 10px; border-radius: 5px; overflow-x: auto;">${error?.stack || 'Sem stack trace'}</pre>
    <button onclick="window.location.reload()" style="padding: 10px 20px; background: #333; color: white; border: none; border-radius: 5px; margin-top: 20px;">Recarregar App</button>
  `;
  document.body.appendChild(errorDiv);
};

window.onunhandledrejection = function(event) {
  console.error('Unhandled Rejection:', event.reason);
  
  if (event.reason?.message?.includes('Invalid Refresh Token')) {
    console.warn('Refresh token invalid, redirecting to login if needed');
    
    return;
  }
};

try {
  const isCadastroPage =
    ['/cadastro', '/comercio', '/entregador'].includes(window.location.pathname) ||
    ['#cadastro', '#comercio', '#entregador'].includes(window.location.hash);
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Elemento root não encontrado');
  }

  createRoot(rootElement).render(
    <StrictMode>
      {isCadastroPage ? <Cadastro /> : <App />}
    </StrictMode>
  );
} catch (error: any) {
  console.error('Render Error:', error);
  document.body.innerHTML = `
    <div style="padding: 20px; color: red;">
      <h1>Erro de Renderização</h1>
      <pre>${error.message}\n${error.stack}</pre>
    </div>
  `;
}