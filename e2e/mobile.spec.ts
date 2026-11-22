import { button, expect, navigate, test } from './workspace';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

test('navegação móvel, menu completo e animação do diálogo', async ({ workspace: page }) => {
  await page.getByRole('link', { name: 'Agenda', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Calendário', exact: true })).toBeVisible();
  await button(page, 'Abrir menu completo').click();
  await navigate(page, 'Questões');
  await button(page, 'Registrar questões').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('animation-name', 'dialog-in');
  await expect(dialog).toHaveCSS('animation-duration', '0.2s');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
