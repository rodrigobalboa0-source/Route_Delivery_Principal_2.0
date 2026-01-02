import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables');
  
  if (typeof window !== 'undefined') {
     document.body.innerHTML = '<div style="color:red; padding:20px;"><h1>Erro de Configuração</h1><p>Variáveis de ambiente do Supabase não encontradas.</p></div>';
  }
}

export const supabase = createClient<Database>(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
