/**
 * Extração de texto de arquivos enviados pelo usuário (gabaritos).
 * PDF é lido no navegador com pdf.js (carregado sob demanda); demais formatos
 * são tratados como texto.
 */

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFileError';
  }
}

export const MAX_UPLOAD_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_PDF_PAGES = 150;
export const MAX_EXTRACTED_TEXT_CHARS = 500_000;

export function isPdf(file: Pick<File, 'name' | 'type'>): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export interface PositionedText {
  str: string;
  x: number;
  y: number;
}

/** Agrupa fragmentos de texto de uma página em linhas (mesma altura) ordenadas da esquerda para a direita. */
export function itemsToLines(items: PositionedText[], tolerance = 3): string[] {
  const rows: { y: number; items: PositionedText[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r.y - item.y) <= tolerance);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => r.items.sort((a, b) => a.x - b.x).map((i) => i.str.trim()).join(' '));
}

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (doc.numPages > MAX_PDF_PAGES) {
    throw new UnsupportedFileError(`O PDF excede o limite de ${MAX_PDF_PAGES} páginas. Cole o gabarito manualmente.`);
  }
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items: PositionedText[] = [];
    for (const item of content.items) {
      if ('str' in item) items.push({ str: item.str, x: item.transform[4], y: item.transform[5] });
    }
    pages.push(itemsToLines(items).join('\n'));
  }
  return pages.join('\n').slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

export async function readFileText(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new UnsupportedFileError('O arquivo excede o tamanho máximo permitido (20 MB). Cole o gabarito manualmente.');
  }
  if (isPdf(file)) {
    try {
      const text = await pdfToText(file);
      if (!text.trim()) throw new UnsupportedFileError('O PDF não contém texto selecionável (talvez seja uma imagem escaneada). Cole o gabarito manualmente.');
      return text;
    } catch (e) {
      if (e instanceof UnsupportedFileError) throw e;
      throw new UnsupportedFileError('Não foi possível ler o PDF. Cole o gabarito manualmente.');
    }
  }
  if (/\.(png|jpe?g|gif|webp|bmp|docx?|xlsx?)$/i.test(file.name)) {
    throw new UnsupportedFileError('Formato não suportado para leitura automática. Use PDF, TXT ou CSV, ou cole o gabarito.');
  }
  const text = await file.text();
  return text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
}
