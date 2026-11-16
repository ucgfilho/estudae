/** Geração de flashcards (certo/errado) via API do Google Gemini, a partir do registro do caderno de erros. */
import { db } from '../db/db';
import type { ErrorFlashcard, ErrorNote } from '../db/types';
import { nowIso } from '../lib/utils';
import { getSettings } from './settings';
import { getAvailableGeminiModelsForAssistant } from './aiAssistant';

const TIMEOUT_MS = 30_000;
const inflight = new Set<string>();

function buildPrompt(note: ErrorNote, topic: string): string {
  return `Você cria flashcards de revisão de questões erradas (estilo Certo/Errado do CEBRASPE/NotebookLM).
Receba o registro do caderno de erros do estudante e devolva SOMENTE um JSON:
{"statement": string, "answer": "certo" | "errado", "explanation": string}
Regras:
- "statement": o enunciado EXATAMENTE como o estudante escreveu (copie o texto do campo Enunciado, sem reescrever). Se não houver rótulo de enunciado, use o texto da questão do registro.
- "answer": o gabarito (Certo ou Errado). Se o registro trouxer "Gabarito", use-o.
- "explanation": a definição/explicação correta do enunciado, usando o que o estudante anotou (Explicação, Anotação para o caderno), sem inventar fatos.

Referência: ${note.sourceReference || '—'}
Tópico: ${topic || '—'}
Registro do estudante:
"""
${note.explanation}
"""`;
}

function parse(raw: string): Omit<ErrorFlashcard, 'generatedAt'> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const obj = JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw) as Record<string, unknown>;
  const answer = String(obj.answer ?? '').trim().toLowerCase();
  const statement = typeof obj.statement === 'string' ? obj.statement.trim() : '';
  const explanation = typeof obj.explanation === 'string' ? obj.explanation.trim() : '';
  if (!statement || (answer !== 'certo' && answer !== 'errado')) throw new Error('Resposta inválida do Gemini.');
  return { statement, answer, explanation };
}

export async function generateFlashcard(note: ErrorNote, apiKey: string, topic = ''): Promise<ErrorFlashcard> {
  let lastError = 'Não foi possível gerar o flashcard com o Gemini.';
  const models = (await getAvailableGeminiModelsForAssistant(apiKey)).slice(0, 4);
  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildPrompt(note, topic) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      });
      if (res.status === 401 || res.status === 403) throw new Error('Chave de API do Gemini inválida.');
      if (!res.ok) {
        if (lastError.startsWith('Não foi possível')) lastError = `Erro na API do Gemini (${res.status} em ${model}).`;
        continue;
      }
      const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      return { ...parse(text), generatedAt: nowIso() };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (err instanceof DOMException && err.name === 'AbortError') lastError = `Tempo esgotado ao consultar o Gemini (${model}).`;
      if (lastError.includes('inválida')) break;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

export type FlashcardResult = { flashcard: ErrorFlashcard; error?: undefined } | { flashcard: null; error: string };

/** Gera e persiste o flashcard do erro, se ainda não existir. Nunca falha em silêncio: devolve o motivo. */
export async function ensureFlashcard(noteId: string): Promise<FlashcardResult> {
  const note = await db.errorNotes.get(noteId);
  if (!note) return { flashcard: null, error: 'Registro do caderno de erros não encontrado.' };
  if (note.flashcard) return { flashcard: note.flashcard };
  if (inflight.has(noteId)) return { flashcard: null, error: 'Geração já em andamento.' };
  const apiKey = ((await getSettings()).geminiApiKey ?? '').trim();
  if (!apiKey) return { flashcard: null, error: 'Chave da API do Gemini não configurada. Informe-a em Configurações.' };
  if (!note.explanation.trim()) return { flashcard: null, error: 'O erro não tem texto para gerar o flashcard.' };
  inflight.add(noteId);
  try {
    const topic = note.topicId ? ((await db.topics.get(note.topicId))?.title ?? '') : '';
    const flashcard = await generateFlashcard(note, apiKey, topic);
    const fresh = await db.errorNotes.get(noteId);
    if (fresh) await db.errorNotes.put({ ...fresh, flashcard });
    return { flashcard };
  } catch (err) {
    return { flashcard: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    inflight.delete(noteId);
  }
}
