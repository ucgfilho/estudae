import type { Page } from '@playwright/test';
import { button, expect, navigate, test } from './workspace';

const generationEndpoint = '**/api/study-data/error-notes/flashcards/generate';
const cards = [
  {
    statement: 'A busca binária depende de ordenação.',
    answer: 'certo',
    explanation: 'Os elementos precisam estar ordenados.',
  },
  {
    statement: 'A busca binária examina todos os elementos em ordem.',
    answer: 'errado',
    explanation: 'Cada comparação permite descartar metade do intervalo.',
  },
];

async function createNote(page: Page, reference: string, explanation: string) {
  await button(page, 'Adicionar erro').click();
  const dialog = page.getByRole('dialog', { name: 'Adicionar ao caderno de erros' });
  await dialog.getByLabel('Identificação da questão').fill(reference);
  if (explanation) await dialog.getByPlaceholder(/Explique com suas palavras/).fill(explanation);
  await dialog.getByRole('textbox', { name: 'Data do erro' }).fill('16/11/2026');
  await button(dialog, 'Salvar no caderno').click();
  await expect(dialog).toHaveCount(0);
}

async function editNote(page: Page, reference: string) {
  const title = page.getByText(reference, { exact: true });
  await title.click();
  await button(page.locator('details').filter({ has: title }), 'Editar anotação').click();
  return page.getByRole('dialog', { name: 'Editar anotação de erro' });
}

test('gera e persiste cartões apenas para a anotação selecionada', async ({ workspace: page }) => {
  const explanation = 'Busca binária exige ordenação e descarta metade do intervalo por vez.';
  const manualStatement = 'Busca binária é uma técnica de pesquisa.';
  await navigate(page, 'Caderno de erros');
  await createNote(page, 'Outra anotação E2E', 'Acentuação das palavras proparoxítonas.');
  await createNote(page, 'Anotação de busca E2E', explanation);
  let calls = 0;
  await page.route(generationEndpoint, async (route) => {
    const request = route.request();
    expect(request.method()).toBe('POST');
    expect(request.postDataJSON()).toEqual({
      explanation,
      existingStatements: [manualStatement, ...(calls ? cards.map((card) => card.statement) : [])],
    });
    calls++;
    await route.fulfill({ json: { cards: [...cards, cards[0]] } });
  });

  const dialog = await editNote(page, 'Anotação de busca E2E');
  await button(dialog, 'Novo flashcard').click();
  const manual = page.getByRole('dialog', { name: 'Criar flashcard' });
  await manual.getByLabel('Enunciado').fill(manualStatement);
  await manual.getByText('Certo', { exact: true }).click();
  await manual.getByRole('textbox', { name: 'Explicação', exact: true }).fill('O algoritmo pesquisa um alvo.');
  await button(manual, 'Salvar flashcard').click();
  await expect(manual).toHaveCount(0);
  const sync = page.waitForResponse((response) =>
    response.url().endsWith('/api/study-data/batch') &&
    response.request().postData()?.includes(cards[0].statement) === true,
  );
  await button(dialog, 'Gerar flashcards com IA').click();
  expect((await sync).ok()).toBe(true);
  await expect(dialog.getByRole('status')).toHaveText('2 flashcards adicionados.');
  for (const card of cards) {
    const row = dialog.getByRole('listitem').filter({ hasText: card.statement });
    await expect(row.getByText('Gerado por IA')).toBeVisible();
  }
  await expect(dialog.getByRole('listitem').filter({ hasText: manualStatement }).getByText('Gerado por IA')).toHaveCount(0);

  await button(dialog, 'Gerar flashcards com IA').click();
  await expect(dialog.getByRole('status')).toHaveText(/não encontrou novos pontos/);
  expect(calls).toBe(2);

  await page.goto('/');
  await page.getByTestId('contest-card-default').click();
  await navigate(page, 'Caderno de erros');
  const reopened = await editNote(page, 'Anotação de busca E2E');
  await expect(reopened.getByText('Flashcards relacionados (3)')).toBeVisible();
  await expect(reopened.getByText('Gerado por IA')).toHaveCount(2);
  await button(reopened, 'Cancelar').click();
  const other = await editNote(page, 'Outra anotação E2E');
  await expect(other.getByText('Flashcards relacionados (0)')).toBeVisible();
});

test('exige uma explicação e permite tentar de novo após falha do provedor', async ({ workspace: page }) => {
  await navigate(page, 'Caderno de erros');
  await createNote(page, 'Anotação sem explicação E2E', '');
  const dialog = await editNote(page, 'Anotação sem explicação E2E');
  const generate = button(dialog, 'Gerar flashcards com IA');
  await expect(generate).toBeDisabled();

  await page.route(generationEndpoint, (route) =>
    route.fulfill({ status: 502, json: { error: 'O Gemini não conseguiu gerar os flashcards.' } }),
    { times: 1 },
  );
  const draft = 'Busca binária exige ordenação.';
  await dialog.getByPlaceholder(/Explique com suas palavras/).fill(draft);
  await generate.click();
  await expect(dialog.getByText('O Gemini não conseguiu gerar os flashcards.')).toBeVisible();
  await expect(dialog.getByText('Flashcards relacionados (0)')).toBeVisible();
  await page.route(generationEndpoint, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ explanation: draft, existingStatements: [] });
    await route.fulfill({ json: { cards: [] } });
  });
  await generate.click();
  await expect(dialog.getByRole('status')).toHaveText(/não encontrou novos pontos/);
});
