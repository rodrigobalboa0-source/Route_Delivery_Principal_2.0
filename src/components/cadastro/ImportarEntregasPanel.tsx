import { useState } from 'react';
import { supabase } from '../../lib/supabase';

type Row = {
  customer_name: string
  customer_phone: string
  delivery_address: string
  delivery_latitude?: number
  delivery_longitude?: number
  status?: string
};

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] as Row[] };
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rec[h] = String(cols[idx] ?? '').trim();
    });
    rows.push({
      customer_name: rec['customer_name'] || '',
      customer_phone: rec['customer_phone'] || '',
      delivery_address: rec['delivery_address'] || '',
      delivery_latitude: rec['delivery_latitude'] ? Number(rec['delivery_latitude']) : undefined,
      delivery_longitude: rec['delivery_longitude'] ? Number(rec['delivery_longitude']) : undefined,
      status: rec['status'] || 'pendente',
    });
  }
  return { headers, rows };
}

export function ImportarEntregasPanel() {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<number>(0);

  const handleFile = (f: File | null) => {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const parsed = parseCsv(text);
      setRows(parsed.rows);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setOk(0);
    const batch = rows.map((r) => ({
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      delivery_address: r.delivery_address,
      delivery_latitude: r.delivery_latitude ?? 0,
      delivery_longitude: r.delivery_longitude ?? 0,
      status: r.status ?? 'pendente',
    }));
    const res = await (supabase as unknown as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('deliveries').insert(batch);
    const r = res as unknown as { error?: { message?: string } };
    if (r.error?.message) setError(r.error.message);
    else setOk(batch.length);
    setLoading(false);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Importar entregas (CSV)</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <input type="file" accept=".csv" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
        {fileName && (
          <div className="mt-2 text-sm text-slate-700">{fileName} • {rows.length} linhas</div>
        )}
        <div className="mt-4">
          <button onClick={handleImport} disabled={loading || rows.length === 0} className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white text-sm disabled:opacity-50">
            {loading ? 'Importando...' : 'Importar entregas'}
          </button>
          {ok > 0 && <span className="ml-3 text-sm text-slate-700">{ok} registros importados</span>}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg">
        <div className="px-4 py-2 border-b border-slate-200 text-sm text-slate-600">Formato esperado</div>
        <div className="p-4 text-sm text-slate-700">Cabeçalho: customer_name, customer_phone, delivery_address, delivery_latitude, delivery_longitude, status</div>
      </div>
    </div>
  );
}
