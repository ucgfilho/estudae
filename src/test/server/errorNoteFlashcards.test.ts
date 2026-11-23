import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateErrorNoteFlashcards } from '../../../server/services/ErrorNoteFlashcardGenerator';

const input = {
  explanation: 'Busca binária exige que os elementos estejam ordenados.',
  existingStatements: [],
};
const card = {
  statement: 'A busca binária exige elementos ordenados.',
  answer: 'certo',
  explanation: 'A ordenação permite descartar metade dos elementos a cada passo.',
};

function geminiResponse(cards: unknown[]) {
  return Response.json({
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ thought: true, text: 'ignorado' }, { text: JSON.stringify({ cards }) }] },
    }],
  });
}

describe('generateErrorNoteFlashcards', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envia apenas os dados da anotação selecionada para o Gemini 4 Hydrogen', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(geminiResponse([card]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateErrorNoteFlashcards({ ...input, otherNote: 'Outro caderno' }, 'test-key');

    expect(result).toEqual([card]);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-4-hydrogen:generateContent');
    expect(request?.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const payload = JSON.parse(String(request?.body));
    expect(JSON.parse(payload.contents[0].parts[0].text)).toEqual(input);
    expect(payload.systemInstruction.parts[0].text).toContain('exclusivamente a explicação da anotação de erro selecionada');
    expect(payload.generationConfig.responseMimeType).toBe('application/json');
    expect(payload.generationConfig.responseJsonSchema.properties.cards).toMatchObject({ type: 'array' });
    expect(payload.generationConfig.responseJsonSchema.properties.cards.maxItems).toBeUndefined();
  });

  it('aceita zero cartões quando o modelo não encontra conteúdo novo', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(geminiResponse([])));
    await expect(generateErrorNoteFlashcards(input, 'test-key')).resolves.toEqual([]);
  });

  it('rejeita anotação em branco ou chave ausente antes de chamar o Gemini', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateErrorNoteFlashcards({ ...input, explanation: '  ' }, 'test-key')).rejects.toMatchObject({ statusCode: 422 });
    await expect(generateErrorNoteFlashcards(input, '')).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('faz fallback para modelo alternativo quando o modelo primário retorna 503 por alta demanda', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":{"code":503,"status":"UNAVAILABLE"}}', { status: 503 }))
      .mockResolvedValueOnce(geminiResponse([card]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateErrorNoteFlashcards(input, 'test-key')).resolves.toEqual([card]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-4-hydrogen:generateContent');
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-4-neon:generateContent');
  });

  it('rejeita lotes inválidos por inteiro e sinaliza a cota do provedor', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(geminiResponse([card, { ...card, answer: 'talvez' }]))
      .mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(generateErrorNoteFlashcards(input, 'test-key')).rejects.toMatchObject({ statusCode: 502 });
    await expect(generateErrorNoteFlashcards(input, 'test-key')).rejects.toMatchObject({ statusCode: 429 });
  });
});
