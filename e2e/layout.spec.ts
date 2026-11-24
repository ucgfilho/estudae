import { button, expect, navigate, test } from './workspace';

test('alinha o ciclo sem metas de tempo nos dois temas e organiza os painéis no celular', async ({ workspace: page }) => {
  await navigate(page, 'Configurações');
  await page.getByLabel('Meta diária de estudo (min)').fill('0');
  await page.getByLabel('Meta semanal de estudo (min)').fill('0');
  await button(page, 'Salvar alterações').click();
  await expect(page.getByText('Configurações e metas salvas.')).toBeVisible();
  await navigate(page, 'Ciclo de estudos');

  const activity = page.getByRole('region', { name: 'Próxima atividade do ciclo' });
  const summary = page.getByRole('complementary').filter({ hasText: 'Como seu estudo é dividido' });
  const panels = activity.or(summary);
  const duration = page.getByRole('spinbutton', { name: 'Duração personalizada em minutos' });
  await expect(panels).toHaveCount(2);
  await expect(duration).toHaveCount(0);

  const measurePanels = () => panels.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));

  for (const dark of [false, true]) {
    if (dark) await button(page, 'Modo escuro').click();
    const [activityBox, summaryBox] = await measurePanels();
    expect(summaryBox.x).toBeGreaterThan(activityBox.x + activityBox.width);
    expect(Math.abs(summaryBox.y - activityBox.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(summaryBox.height - activityBox.height)).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  const [activityBox, summaryBox] = await measurePanels();
  expect(summaryBox.y).toBeGreaterThan(activityBox.y + activityBox.height);
  expect(Math.abs(summaryBox.width - activityBox.width)).toBeLessThanOrEqual(1);
  await expect(button(activity, 'Iniciar estudo do ciclo')).toBeVisible();
  expect(await page.locator('main').evaluate(main => main.scrollWidth)).toBeLessThanOrEqual(320);
});
