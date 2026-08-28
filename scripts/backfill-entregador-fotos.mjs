/**
 * Backfill: migra as fotos de entregadores que hoje só existem como
 * `foto_base64` (auto-cadastro antigo) para o Storage (bucket `images`),
 * preenchendo `foto_url`.
 *
 * `foto_base64` é MANTIDO intacto (fica como backup) — este script nunca
 * escreve nessa coluna. Só preenche `foto_url` de quem ainda não tem.
 *
 * Só mexe na foto de perfil. CNH, comprovante e documento do veículo NÃO são
 * tocados — se precisar, é só duplicar a lógica.
 *
 * Uso:
 *   SUPABASE_URL=https://SEU-SUPABASE \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/backfill-entregador-fotos.mjs            # dry-run (não escreve nada)
 *
 *   ... node scripts/backfill-entregador-fotos.mjs --apply   # executa de verdade
 *
 * Requer: @supabase/supabase-js (já é dependência do projeto) e Node 18+.
 * A service_role key NÃO fica no repositório — passe por env na hora de rodar.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');
const BUCKET = 'images';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltando env: SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** "data:image/png;base64,AAAA..." -> { mime, ext, buffer } | null */
function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const mime = (m[1] || 'image/jpeg').toLowerCase();
  const isBase64 = Boolean(m[2]);
  const data = m[3] || '';
  try {
    const buffer = isBase64
      ? Buffer.from(data, 'base64')
      : Buffer.from(decodeURIComponent(data), 'utf8');
    if (!buffer.length) return null;
    return { mime, ext: EXT_BY_MIME[mime] || 'jpg', buffer };
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n=== Backfill fotos de entregador — modo: ${APPLY ? 'APPLY (escreve)' : 'DRY-RUN'} ===\n`);

  const { data: allWithBase64, error } = await supabase
    .from('entregadores')
    .select('id, email, foto_base64, foto_url')
    .not('foto_base64', 'is', null)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao listar entregadores:', error.message);
    process.exit(1);
  }

  // Filtra em JS (evita depender da sintaxe de filtro do PostgREST para
  // "vazio ou nulo"): só quem NÃO tem foto_url utilizável.
  const rows = (allWithBase64 || []).filter((r) => !r.foto_url || !String(r.foto_url).trim());

  console.log(
    `${allWithBase64.length} com foto_base64; ${rows.length} sem foto_url (serão processados).\n`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const tag = `${row.id} (${row.email || 'sem email'})`;
    const parsed = parseDataUrl(row.foto_base64);
    if (!parsed) {
      console.warn(`- SKIP  ${tag}: foto_base64 não é um data URL válido (len=${(row.foto_base64 || '').length})`);
      skipped++;
      continue;
    }

    const path = `entregadores/${row.id}/foto-backfill.${parsed.ext}`;
    const kb = Math.round(parsed.buffer.length / 1024);

    if (!APPLY) {
      console.log(`- DRY   ${tag}: subiria ${kb} KB -> ${BUCKET}/${path}`);
      ok++;
      continue;
    }

    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: true });
    if (up.error) {
      console.error(`- FAIL  ${tag}: upload -> ${up.error.message}`);
      failed++;
      continue;
    }

    const publicUrl = supabase.storage.from(BUCKET).getPublicUrl(up.data.path).data.publicUrl;

    const { data: updated, error: updErr } = await supabase
      .from('entregadores')
      .update({ foto_url: publicUrl }) // foto_base64 preservado de propósito (backup)
      .eq('id', row.id)
      .select('id');

    if (updErr) {
      console.error(`- FAIL  ${tag}: update -> ${updErr.message}`);
      failed++;
      continue;
    }
    if (!updated || updated.length === 0) {
      console.error(`- FAIL  ${tag}: update não afetou nenhuma linha`);
      failed++;
      continue;
    }

    console.log(`- OK    ${tag}: ${kb} KB -> ${publicUrl}`);
    ok++;
  }

  console.log(`\n=== Fim. ok=${ok} skip=${skipped} fail=${failed} ${APPLY ? '' : '(nada foi escrito — rode com --apply)'}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
