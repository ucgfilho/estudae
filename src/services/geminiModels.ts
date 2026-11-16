/** Modelo principal de todas as chamadas ao Gemini. */
export const PRIMARY_GEMINI_MODEL = 'gemini-3.8-flash';

const NON_TEXT = /embedding|aqa|imagen|image|tts|audio|live|vision|robotics|computer-use|veo|learnlm|gemma/i;

/** Mantém só modelos de texto, com o principal sempre em primeiro lugar e os demais como reserva. */
export function orderGeminiModels(listed: readonly string[]): string[] {
  const rank = (n: string) => (n === PRIMARY_GEMINI_MODEL ? 0 : n.startsWith(PRIMARY_GEMINI_MODEL) ? 1 : /^gemini-2\.5-flash/.test(n) ? 2 : n.includes('flash') ? 3 : n.includes('pro') ? 4 : 5);
  const text = listed.filter((n) => n && !NON_TEXT.test(n)).sort((a, b) => rank(a) - rank(b));
  return [PRIMARY_GEMINI_MODEL, ...text.filter((n) => n !== PRIMARY_GEMINI_MODEL)];
}
