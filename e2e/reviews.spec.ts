import { button, expect, navigate, test } from './workspace';

test('registra um erro, cria flashcard, responde à revisão e exclui a anotação', async ({ workspace: page }) => {
  await navigate(page, 'Caderno de erros');
  await button(page, 'Adicionar erro').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Identificação da questão').fill('Avaliação E2E');
  await dialog.getByPlaceholder(/Explique com suas palavras/).fill('Concordância do verbo com o sujeito.');
  const yesterday = new Date(Date.now() - 86_400_000);
  await dialog.getByRole('textbox', { name: 'Data do erro' }).fill(yesterday.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' }));
  await button(dialog, 'Salvar no caderno').click();
  await page.getByLabel('Buscar no caderno').fill('Avaliação E2E');
  await page.getByText('Avaliação E2E', { exact: true }).click();
  await button(page, 'Criar flashcard').click();
  await dialog.getByLabel('Enunciado').fill('O verbo concorda com o sujeito.');
  await dialog.getByText('Certo', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Explicação', exact: true }).fill('Concordância verbal.');
  await button(dialog, 'Salvar flashcard').click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Revisões');
  await expect(page.getByText('O verbo concorda com o sujeito.')).toBeVisible();
  await button(page, 'Errado').click();
  await expect(page.getByText('Você errou')).toBeVisible();
  await button(page, 'Finalizar').click();
  await button(page, 'Refazer os que errei (1)').click();
  await button(page, 'Certo').click();
  await expect(page.getByText('Você acertou!')).toBeVisible();
  await button(page, 'Finalizar revisão de erros').click();
  await expect(page.getByText(/0 acertos · 1 erro/)).toBeVisible();
  await navigate(page, 'Caderno de erros');
  await page.getByText('Avaliação E2E', { exact: true }).click();
  await button(page, 'Excluir anotação').click();
  await button(dialog, 'Excluir anotação').click();
  await expect(page.getByText('Nenhum erro encontrado')).toBeVisible();
});

test('mantém a próxima rodada na fila e credita XP apenas após concluir as revisões', async ({ workspace: page }) => {
  await page.clock.setFixedTime(new Date('2026-11-17T15:00:00Z'));
  await navigate(page, 'Caderno de erros');
  const dialog = page.getByRole('dialog');
  for (let question = 1; question <= 5; question++) {
    await button(page, 'Adicionar erro').click();
    await dialog.getByLabel('Identificação da questão').fill(`Prova · questão ${question}`);
    await dialog.getByRole('textbox', { name: 'Data do erro' }).fill('16/11/2026');
    await button(dialog, 'Salvar no caderno').click();
    await expect(dialog).toHaveCount(0);
  }

  await navigate(page, 'Revisões');
  const complete = button(page, 'Concluir sem flashcard');
  for (let count = 0; count < 5; count++) await complete.click();
  await expect(page.locator('time[datetime="2026-11-17"]')).toHaveCount(5);
  await expect(complete).toHaveCount(0);

  await page.clock.setFixedTime(new Date('2026-11-23T15:00:00Z'));
  await page.goto('/');
  await page.getByTestId('contest-card-default').click();
  await navigate(page, 'Revisões');
  await expect(complete).toBeVisible();
  await expect(page.getByText('Revisão 1 de 5', { exact: true })).toBeVisible();
  await expect(page.locator('time[datetime="2026-11-23"]')).toHaveCount(0);

  await navigate(page, 'Visão geral');
  const rankPanel = page.locator('summary').filter({ hasText: 'Patente, constância e regras de XP' });
  const xpSummary = page.locator('summary').filter({ hasText: 'Escada de patentes e histórico' });
  const xpHistory = xpSummary.locator('..');
  await rankPanel.click();
  await xpSummary.click();
  await expect(xpHistory.getByText('5 revisões (4 com XP)', { exact: true })).toBeVisible();
  await expect(xpHistory.getByText('23/11/2026', { exact: true })).toHaveCount(0);

  await navigate(page, 'Revisões');
  for (let count = 0; count < 5; count++) await complete.click();
  await expect(page.locator('time[datetime="2026-11-23"]')).toHaveCount(5);
  await expect(complete).toHaveCount(0);

  await navigate(page, 'Visão geral');
  await rankPanel.click();
  await xpSummary.click();
  const todayXp = xpHistory.getByRole('listitem').filter({ hasText: '23/11/2026' });
  await expect(todayXp.getByText('5 revisões (4 com XP)', { exact: true })).toBeVisible();
  await expect(todayXp.getByText('+120', { exact: true })).toBeVisible();
});

test('importa checklist com subtópico e localiza o conteúdo na disciplina', async ({ workspace: page }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  await button(page, 'Importar checklist').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Texto do edital / checklist').fill('1. Pesquisa E2E\n  1.1 Busca binária');
  await dialog.getByRole('button', { name: /Importar 1 tópico e 1 subtópico/ }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByPlaceholder('Buscar tópico por palavra-chave...').fill('Pesquisa E2E');
  await expect(page.getByText('1. Pesquisa E2E', { exact: true })).toBeVisible();
});
