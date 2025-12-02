import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { Cadastro } from './components/Cadastro';
import './index.css';

const isCadastroPage = window.location.pathname === '/cadastro';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCadastroPage ? <Cadastro /> : <App />}
  </StrictMode>
);
