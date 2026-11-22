import { readFile } from 'node:fs/promises';
import { button, expect, navigate, test } from './workspace';

test('relatórios mantêm filtros ao navegar e exportam sessões e questões', async ({ workspace: page }) => {
  await navigate(page, 'Relatórios');
  await button(page, 'Diário').click();
  await button(page, '30 dias').click();
  await navigate(page, 'Calendário');
  await navigate(page, 'Relatórios');
  for (const label of ['Diário', '30 dias']) {
    await expect(button(page, label)).toHaveAttribute('aria-pressed', 'true');
  }
  for (const label of ['Exportar sessões (CSV)', 'Exportar questões (CSV)']) {
    const downloading = page.waitForEvent('download');
    await button(page, label).click();
    const file = await downloading;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    expect((await readFile((await file.path())!, 'utf8')).trim()).not.toBe('');
  }
});

test('metas, backup, restauração, reinicialização e exclusão da conta de teste', async ({ workspace: page }) => {
  await navigate(page, 'Configurações');
  const goal = page.getByRole('spinbutton', { name: 'Meta diária de estudo (min)' });
  await goal.fill('87');
  await button(page, 'Salvar alterações').click();
  const downloading = page.waitForEvent('download');
  await button(page, 'Baixar cópia (JSON)').click();
  const file = await downloading;
  const backup = await readFile((await file.path())!);
  expect(JSON.parse(backup.toString()).data.settings[0].dailyGoalMinutes).toBe(87);
  await goal.fill('31');
  await button(page, 'Salvar alterações').click();
  const choosing = page.waitForEvent('filechooser');
  await button(page, 'Selecionar arquivo JSON').click();
  await (await choosing).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await button(page.getByRole('dialog'), 'Substituir dados e restaurar').click();
  await expect(goal).toHaveValue('87');
  await page.getByText('Excluir dados ou conta', { exact: true }).click();
  await button(page, 'Reiniciar plataforma').click();
  await button(page.getByRole('dialog'), 'Reiniciar sistema').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button(page, 'Excluir conta e dados').click();
  await button(page.getByRole('dialog'), 'Excluir minha conta').click();
  await expect(button(page, 'Entrar na plataforma')).toBeVisible();
});

test('cria um concurso personalizado, alterna e remove apenas o escolhido', async ({ workspace: page }) => {
  const change = page.getByTestId('sidebar-switch-contest-button');
  await change.click();
  await page.getByTestId('new-contest-card-button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do concurso').fill('Concurso E2E');
  await dialog.getByLabel('Cargo (opcional)').fill('Analista');
  await button(dialog, 'Continuar').click();
  await expect(dialog.getByText('Etapa 2 de 2')).toBeVisible();
  await dialog.getByTestId('edital-file-input').setInputFiles({
    name: 'edital.txt', mimeType: 'text/plain',
    buffer: Buffer.from('Língua Portuguesa:\n1. Concordância verbal'),
  });
  await expect(dialog.getByText('edital.txt', { exact: true })).toBeVisible();
  await button(dialog, 'Criar concurso').click();
  await change.click();
  const custom = page.getByTestId(/^contest-card-/).filter({ hasText: 'Concurso E2E' });
  await expect(custom).toBeVisible();
  await button(page, 'Gerenciar concursos').click();
  await custom.getByTitle('Excluir concurso').press('Enter');
  await expect(custom).toHaveCount(0);
  await page.getByTestId('contest-card-default').press('Enter');
  await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
});

test('backup inválido apresenta erro e mantém os dados', async ({ workspace: page }) => {
  await navigate(page, 'Configurações');
  const goal = page.getByRole('spinbutton', { name: 'Meta diária de estudo (min)' });
  const before = await goal.inputValue();
  const choosing = page.waitForEvent('filechooser');
  await button(page, 'Selecionar arquivo JSON').click();
  await (await choosing).setFiles({ name: 'invalido.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert')).toContainText('Arquivo de backup inválido');
  await expect(goal).toHaveValue(before);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('valida metas, persiste preferências e mantém celebrações ativas', async ({ workspace: page }) => {
  await navigate(page, 'Configurações');
  await page.getByLabel('Meta de acerto (%)').fill('110');
  await button(page, 'Salvar alterações').click();
  await expect(page.getByRole('alert')).toContainText('entre 1% e 100%');
  await page.getByLabel('Meta de acerto (%)').fill('85');
  await page.getByLabel('Intervalos de revisão (dias)').fill('1, 4, 12');
  await page.getByLabel('Data da prova').fill('17/08/2030');
  await expect(page.getByText('Animações de celebração ao concluir metas')).toHaveCount(0);
  await button(page, 'Salvar alterações').click();
  await expect(page.getByText('Configurações e metas salvas.')).toBeVisible();
  await navigate(page, 'Relatórios');
  await navigate(page, 'Configurações');
  await expect(page.getByLabel('Data da prova')).toHaveValue('17/08/2030');
  await expect(page.getByLabel('Intervalos de revisão (dias)')).toHaveValue('1,4,12');
  await expect(page.getByText('Animações de celebração ao concluir metas')).toHaveCount(0);
});
