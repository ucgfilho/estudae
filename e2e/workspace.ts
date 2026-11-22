import { randomUUID } from 'node:crypto';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

export { expect };
export const button = (root: Page | Locator, name: string) =>
  root.getByRole('button', { name, exact: true });

export async function navigate(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: label, exact: true }).click();
}

export async function chooseDiscipline(page: Page) {
  await page.getByRole('dialog').getByRole('combobox', { name: 'Disciplina', exact: true }).click();
  await page.getByRole('option', { name: 'Língua Portuguesa', exact: true }).click();
}

export const test = base.extend<{ workspace: Page }>({
  workspace: async ({ page }, runTest) => {
    const errors: string[] = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.goto('/');
    await page.getByRole('tab', { name: 'Cadastrar conta' }).click();
    await page.locator('[name=name]').fill('Estudante E2E');
    await page.locator('[name=email]').fill(randomUUID() + '@example.test');
    await page.locator('[name=password]').fill('estudos-e2e-123');
    await page.locator('[name=confirmPassword]').fill('estudos-e2e-123');
    await page.getByTestId('contest-dropdown-trigger').click();
    await page.getByTestId('contest-option-bnb-ti').click();
    await button(page, 'Criar conta e iniciar meu ciclo').click();
    await page.getByTestId('contest-card-default').click();
    await expect(page.getByRole('heading', { name: 'Visão geral' })).toBeVisible();
    await runTest(page);
    expect(errors).toEqual([]);
  },
});
