import { button, expect, navigate, test } from './workspace';

test('login, senha visível, perfil e encerramento da sessão', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name=email]').fill('estudante@example.test');
  await page.locator('[name=password]').fill('estudos-e2e-123');
  await button(page, 'Mostrar senha').click();
  await expect(page.locator('[name=password]')).toHaveAttribute('type', 'text');
  await button(page, 'Ocultar senha').click();
  await button(page, 'Entrar na plataforma').click();
  await page.getByTestId('selector-profile-button').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Nome', exact: true }).fill('Perfil atualizado');
  await button(dialog, 'Salvar').click();
  await expect(page.getByTestId('selector-profile-button')).toContainText('Perfil atualizado');
  await button(page, 'Sair').click();
  await expect(button(page, 'Entrar na plataforma')).toBeVisible();
});

test('menu principal abre todas as telas e identifica o destino ativo', async ({ workspace: page }) => {
  await button(page, 'Recolher barra lateral').click();
  await expect(button(page, 'Expandir barra lateral')).toHaveAttribute('aria-expanded', 'false');
  await button(page, 'Expandir barra lateral').click();
  for (const [label, heading] of [
    ['Calendário', 'Calendário'], ['Ciclo de estudos', 'Ciclo de estudos'],
    ['Estudar agora', 'Estudar agora'], ['Questões', 'Banco de questões'],
    ['Caderno de erros', 'Caderno de erros'], ['Revisões', 'Revisões espaçadas'],
    ['Simulados', 'Simulados'], ['Disciplinas e conteúdos', 'Disciplinas e conteúdos'],
    ['Relatórios', 'Relatórios'], ['Configurações', 'Configurações e metas'], ['Visão geral', 'Visão geral'],
  ]) {
    await navigate(page, label);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
    await skip.focus();
    await skip.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.locator('#sidebar-links [aria-current=page]')).toHaveAccessibleName(label);
  }
});

test('hover de ação, foco por teclado e tema', async ({ page }) => {
  await page.goto('/');
  const submit = button(page, 'Entrar na plataforma');
  await submit.hover();
  await expect(submit).toHaveCSS('translate', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(submit).toHaveCSS('translate', 'none');
  const tab = page.getByRole('tab', { name: 'Já tenho conta' });
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Cadastrar conta' })).toBeFocused();
  const theme = button(page, 'Modo escuro');
  const before = await page.locator('html').getAttribute('data-theme');
  await theme.click();
  const selected = before === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', selected);
});

test('credenciais inválidas e validação do cadastro preservam o formulário', async ({ page }) => {
  await page.goto('/');
  await page.locator('[name=email]').fill('ausente@example.test');
  await page.locator('[name=password]').fill('senha-incorreta');
  await button(page, 'Entrar na plataforma').click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('tab', { name: 'Cadastrar conta' }).click();
  await page.locator('[name=name]').fill('Estudante');
  await page.locator('[name=email]').fill('cadastro@example.test');
  await page.locator('[name=password]').fill('estudos-e2e-123');
  await page.locator('[name=confirmPassword]').fill('estudos-e2e-456');
  await button(page, 'Criar conta e iniciar meu ciclo').click();
  await expect(page.getByRole('alert')).toContainText('As senhas digitadas não conferem');
  await page.locator('[name=confirmPassword]').fill('estudos-e2e-123');
  await button(page, 'Criar conta e iniciar meu ciclo').click();
  await expect(page.getByRole('alert')).toContainText('Escolha o concurso');
  await page.getByTestId('contest-dropdown-trigger').click();
  await page.getByTestId('contest-search-input').fill('Concurso fictício');
  await page.getByRole('button', { name: /como Concurso Personalizado/ }).click();
  await expect(page.getByPlaceholder(/Petrobras/)).toHaveValue('Concurso fictício');
});
