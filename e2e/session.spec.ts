import { button, expect, navigate, test } from './workspace';
import type { Page } from '@playwright/test';

async function refreshWorkspace(page: Page) {
  const refreshed = page.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/study-data' && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await (await refreshed).finished();
}

test('recarregar recupera a sessão pelo cookie quando o cadastro local da sessão é perdido', async ({ workspace: page }) => {
  await page.evaluate(() => localStorage.removeItem('bnb_auth_session_v2'));
  await page.reload();
  await page.getByTestId('contest-card-default').click({ timeout: 6000 });
  await expect(page.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible();
});

test('a atualização automática preserva os campos de questões, planejamento e metas', async ({ workspace: page }) => {
  await button(page, 'Registrar questões').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Banca ou fonte').fill('Questões em edição');
  await dialog.getByLabel('Acertos').fill('7');
  await refreshWorkspace(page);
  await expect(dialog.getByLabel('Banca ou fonte')).toHaveValue('Questões em edição');
  await expect(dialog.getByLabel('Acertos')).toHaveValue('7');
  await button(dialog, 'Cancelar').click();

  await button(page, 'Planejar sessão').click();
  await dialog.getByLabel('Objetivo da sessão').fill('Objetivo em edição');
  await refreshWorkspace(page);
  await expect(dialog.getByLabel('Objetivo da sessão')).toHaveValue('Objetivo em edição');
  await button(dialog, 'Cancelar').click();

  await navigate(page, 'Configurações');
  const goal = page.getByRole('spinbutton', { name: 'Meta diária de estudo (min)' });
  await goal.fill('87');
  await refreshWorkspace(page);
  await expect(goal).toHaveValue('87');
});

test('uma resposta 401 isolada preserva a edição enquanto a sessão ainda é válida', async ({ workspace: page }) => {
  await navigate(page, 'Configurações');
  const goal = page.getByRole('spinbutton', { name: 'Meta diária de estudo (min)' });
  await goal.fill('87');
  await page.route('**/api/study-data', route =>
    route.fulfill({ status: 401, json: { error: 'Falha temporária no carregamento' } }), { times: 1 });

  const confirmed = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/auth/me' && response.ok());
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await (await confirmed).finished();
  await expect(goal).toHaveValue('87');

  await page.context().clearCookies();
  await page.reload();
  await expect(button(page, 'Entrar na plataforma')).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bnb_auth_session_v2'))).toBeNull();
});
