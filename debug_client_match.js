
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mtanrihprbgrrtgwcyia.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10YW5yaWhwcmJncnJ0Z3djeWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMzU2OTIsImV4cCI6MjA3ODYxMTY5Mn0.5YbuhWG41iI5FJA8IfELbYV5eblz3l-tlG2OScIi8jY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkClient() {
  console.log('--- Checking Client and Commission Tables ---');

  console.log('--- All Clients ---');
  const { data: allClients, error: allErr } = await supabase.from('clientes').select('id, nome_completo');
  if (allErr) console.error(allErr);
  else {
      allClients.forEach(c => console.log(`${c.nome_completo}: ${c.id}`));
  }

  // 2. Fetch all commission tables
  const { data: tables, error: tErr } = await supabase.from('tabelas_comissoes').select('*');
  if (tErr) {
      console.error(tErr);
      return;
  }

  console.log('--- Tables ---');
  tables.forEach(t => {
      console.log(`Table: ${t.nome}`);
      console.log(`ID: ${t.id}`);
      console.log(`Cliente IDs (Raw):`, t.cliente_ids);
      console.log(`Type of Cliente IDs:`, typeof t.cliente_ids);
      
      let ids = t.cliente_ids;
      if (typeof ids === 'string') {
          try {
              ids = JSON.parse(ids);
              console.log('Parsed IDs:', ids);
          } catch(e) {
              console.log('Failed to parse string IDs');
          }
      }
      
      if (Array.isArray(ids)) {
          const match = ids.includes(targetId);
          console.log(`Matches Target Client? ${match}`);
      } else {
          console.log('Not an array');
      }
      console.log('---');
  });
}

checkClient();
