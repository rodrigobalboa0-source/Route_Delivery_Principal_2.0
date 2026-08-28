// Compressão de imagem client-side antes de upload/armazenamento.
// Objetivo: nenhuma foto de cadastro (perfil, CNH, comprovante, documento do
// veículo) chegar ao Storage ou ao banco com vários MB. Reduz a maior dimensão
// para `maxDim` px e recodifica como JPEG. Nunca lança: se algo falhar
// (canvas indisponível, arquivo não-imagem, etc.) devolve o arquivo original.

export interface CompressImageOptions {
  /** Maior dimensão (largura ou altura) do resultado, em px. Padrão 1280. */
  maxDim?: number;
  /** Qualidade JPEG de 0 a 1. Padrão 0.7. */
  quality?: number;
  /** Abaixo deste tamanho (bytes) e já dentro de maxDim, não mexe. Padrão 300 KB. */
  skipIfUnder?: number;
}

const readAsDataURL = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('FileReader falhou'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar imagem'));
    img.src = src;
  });

export async function compressImage(file: File, opts: CompressImageOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 1280;
  const quality = opts.quality ?? 0.7;
  const skipIfUnder = opts.skipIfUnder ?? 300 * 1024;

  if (!file || !file.type || !file.type.startsWith('image/')) return file;
  // GIF/SVG: não recomprimir (perde animação / rasteriza vetor).
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;

  try {
    const dataUrl = await readAsDataURL(file);
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    if (w <= maxDim && h <= maxDim && file.size <= skipIfUnder) return file;

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });
    if (!blob || blob.size === 0) return file;
    // Se a "compressão" ficou maior que o original, mantém o original.
    if (blob.size >= file.size) return file;

    const baseName = (file.name || 'imagem').replace(/\.[^./\\]+$/, '');
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}
