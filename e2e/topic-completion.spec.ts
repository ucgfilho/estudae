import type { Page } from '@playwright/test';
import { button, expect, navigate, registerWorkspace, test } from './workspace';

const sourceTitle = 'Interpretação de textos digitais';
const equivalentTitle = 'Interpretacao de texto digital';
const closeTitle = 'Interpretação de textos digitais e literários';

function status(page: Page, title: string) {
  return page.getByRole('combobox', { name: 'Status de ' + title, exact: true });
}

async function setStatus(page: Page, title: string, label: string) {
  await status(page, title).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function createTopic(page: Page, title: string) {
  await button(page, 'Novo tópico').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título do Tópico').fill(title);
  await button(dialog, 'Criar').click();
  await expect(dialog).toHaveCount(0);
}

async function addContest(page: Page) {
  await page.getByTestId('sidebar-switch-contest-button').click();
  await page.getByTestId('new-contest-card-button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do concurso').fill('Concurso reaproveitamento');
  await button(dialog, 'Continuar').click();
  await dialog.getByTestId('edital-file-input').setInputFiles({
    name: 'edital.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Língua Portuguesa:\n1. ' + equivalentTitle + '\n2. ' + closeTitle),
  });
  await expect(dialog.getByText('edital.txt', { exact: true })).toBeVisible();
  await button(dialog, 'Criar concurso').click();
  await expect(dialog).toHaveCount(0);
}

async function openContest(page: Page, target: 'original' | 'new') {
  await page.getByTestId('sidebar-switch-contest-button').click();
  const card = target === 'original'
    ? page.getByTestId('contest-card-default')
    : page.getByTestId(/^contest-card-/).filter({ hasText: 'Concurso reaproveitamento' });
  await card.click();
  await navigate(page, 'Disciplinas e conteúdos');
}

test('reaproveita conclusão em concurso existente e permite reabrir só o tópico desejado', async ({ workspace: page }) => {
  await addContest(page);
  await navigate(page, 'Disciplinas e conteúdos');
  await expect(status(page, equivalentTitle)).toHaveText('Não iniciado');

  await openContest(page, 'original');
  await createTopic(page, sourceTitle);
  await setStatus(page, sourceTitle, 'Dominado');

  await openContest(page, 'new');
  await expect(status(page, equivalentTitle)).toHaveText('Concluído');
  await expect(status(page, closeTitle)).toHaveText('Não iniciado');
  await setStatus(page, equivalentTitle, 'Em andamento');

  await openContest(page, 'original');
  await expect(status(page, sourceTitle)).toHaveText('Dominado');
  await openContest(page, 'new');
  await expect(status(page, equivalentTitle)).toHaveText('Em andamento');
  await page.reload();
  await page.getByTestId(/^contest-card-/).filter({ hasText: 'Concurso reaproveitamento' }).click();
  await expect(status(page, equivalentTitle)).toHaveText('Em andamento');
});

test('exibe conclusão reaproveitada na criação de concurso e de tópico', async ({ workspace: page }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  await createTopic(page, sourceTitle);
  await setStatus(page, sourceTitle, 'Concluído');
  await createTopic(page, 'Pontuação de textos digitais');
  await setStatus(page, 'Pontuação de textos digitais', 'Concluído');

  await addContest(page);
  await navigate(page, 'Disciplinas e conteúdos');
  await expect(status(page, equivalentTitle)).toHaveText('Concluído');
  await expect(status(page, closeTitle)).toHaveText('Não iniciado');

  await createTopic(page, 'Pontuacao de texto digital');
  await expect(status(page, 'Pontuacao de texto digital')).toHaveText('Concluído');
});

test('mantém o tópico pendente em outra conta', async ({ workspace: page, browser, baseURL }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  await createTopic(page, sourceTitle);
  await setStatus(page, sourceTitle, 'Concluído');
  await addContest(page);
  await navigate(page, 'Disciplinas e conteúdos');
  await expect(status(page, equivalentTitle)).toHaveText('Concluído');

  const otherUser = await browser.newPage({ baseURL });
  try {
    await registerWorkspace(otherUser);
    await addContest(otherUser);
    await navigate(otherUser, 'Disciplinas e conteúdos');
    await expect(status(otherUser, equivalentTitle)).toHaveText('Não iniciado');
  } finally {
    await otherUser.close();
  }
});
