import { button, chooseDiscipline, expect, navigate, test } from './workspace';

test('planejamento no calendário e alternância de períodos', async ({ workspace: page }) => {
  await button(page, 'Planejar sessão').click();
  await chooseDiscipline(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Objetivo da sessão').fill('Praticar interpretação');
  await button(dialog, 'Criar sessão').click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Calendário');
  for (const mode of ['Semanal', 'Diária', 'Mensal']) {
    await button(page, mode).click();
    await expect(button(page, mode)).toHaveAttribute('aria-pressed', 'true');
    await button(page, 'Próximo período').click();
    await button(page, 'Período anterior').click();
    await button(page, 'Hoje').click();
  }
  await button(page, 'Diária').click();
  await button(page, 'Detalhes').click();
  await button(page, 'Editar detalhes').click();
  await dialog.getByLabel('Objetivo da sessão').fill('Revisar concordância');
  await button(dialog, 'Salvar alterações').click();
  await expect(dialog).toHaveCount(0);
  await button(page, 'Reagendar').click();
  await dialog.getByLabel('Horário previsto').fill('18:45');
  await button(dialog, 'Reagendar').click();
  await expect(dialog).toHaveCount(0);
  await button(page, 'Marcar Concluída').click();
  await button(page, 'Reabrir Sessão').click();
  await button(page, 'Excluir sessão').click();
  await button(dialog, 'Excluir sessão').click();
  await expect(page.getByText('Revisar concordância', { exact: true })).toHaveCount(0);
});

test('ciclo, cronômetro, pausa, retomada, foco e conclusão', async ({ workspace: page }) => {
  await navigate(page, 'Ciclo de estudos');
  await button(page, '25 min').click();
  await expect(page.getByRole('spinbutton', { name: 'Duração personalizada em minutos' })).toHaveValue('25');
  await button(page, 'Ver ciclo completo').click();
  await button(page, 'Iniciar estudo do ciclo').click();
  await button(page, 'Pausar').click();
  await expect(page.getByText('Sessão pausada', { exact: true })).toBeVisible();
  await button(page, 'Continuar').click();
  await button(page, 'Modo foco').click();
  await button(page, 'Sair do modo foco').click();
  await expect(page.getByRole('timer')).not.toHaveText('00:00:00');
  await button(page, 'Finalizar e salvar').click();
  await expect(page.getByText('Sessão finalizada e salva')).toBeVisible();
});

test('registro de questões, filtro, edição e exclusão', async ({ workspace: page }) => {
  await button(page, 'Registrar questões').click();
  const dialog = page.getByRole('dialog');
  await chooseDiscipline(page);
  await dialog.getByLabel('Banca ou fonte').fill('Banca de teste');
  await dialog.getByLabel('Acertos').fill('8');
  await dialog.getByLabel('Erros', { exact: true }).fill('2');
  await button(dialog, 'Registrar questões').click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, 'Questões');
  await button(page, 'Hoje').click();
  await page.getByLabel('Banca ou fonte').fill('Banca de teste');
  await button(page, 'Editar lançamento').click();
  await dialog.getByLabel('Banca ou fonte').fill('Banca de teste revisada');
  await button(dialog, 'Salvar alterações').click();
  await expect(page.getByText('Banca de teste revisada', { exact: true })).toBeVisible();
  await button(page, 'Excluir lançamento').click();
  await button(dialog, 'Excluir registro').click();
  await expect(button(page, 'Editar lançamento')).toHaveCount(0);
});

test('tópicos, pesquisa, mudança de status, edição e exclusão', async ({ workspace: page }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  const dialog = page.getByRole('dialog');
  await button(page, 'Novo tópico').click();
  await dialog.getByLabel('Título do Tópico').fill('Estudo de concordância E2E');
  await button(dialog, 'Criar').click();
  await expect(dialog).toHaveCount(0);
  await page.getByPlaceholder('Buscar tópico por palavra-chave...').fill('concordância E2E');
  await expect(button(page, 'Editar tópico')).toHaveCount(1);
  await expect(button(page, 'Mover para cima')).toBeEnabled();
  await expect(button(page, 'Mover para baixo')).toBeDisabled();
  await page.getByRole('combobox', { name: /Status de Estudo de concordância E2E/ }).click();
  await page.getByRole('option', { name: 'Em andamento' }).click();
  await button(page, 'Editar tópico').click();
  await dialog.getByLabel('Título do Tópico').fill('Estudo de concordância E2E revisado');
  await button(dialog, 'Salvar').click();
  await expect(page.getByText('Estudo de concordância E2E revisado', { exact: true })).toBeVisible();
  await button(page, 'Excluir tópico').click();
  await button(dialog, 'Excluir Tópico').click();
  await expect(button(page, 'Editar tópico')).toHaveCount(0);
});

test('simulado com arquivo, respostas, resultado, histórico e exclusão', async ({ workspace: page }) => {
  await navigate(page, 'Simulados');
  await expect(button(page, 'Gerar folha de respostas')).toBeDisabled();
  await page.getByLabel('Gabarito', { exact: true }).setInputFiles({
    name: 'Simulado local.txt', mimeType: 'text/plain', buffer: Buffer.from('1 A\n2 B'),
  });
  await expect(page.getByLabel('Nome do simulado')).toHaveValue('Simulado local');
  await button(page, 'Gerar folha de respostas').click();
  await page.getByRole('radiogroup', { name: 'Questão 1', exact: true }).getByText('A', { exact: true }).click();
  await page.getByRole('radiogroup', { name: 'Questão 2', exact: true }).getByText('C', { exact: true }).click();
  await button(page, 'Enviar respostas').click();
  await expect(page.getByTestId('exam-result')).toContainText('50%');
  await button(page, 'Novo simulado').click();
  await page.getByRole('button', { name: /^Simulado local/ }).click();
  await expect(page.getByTestId('exam-result')).toBeVisible();
  await button(page, 'Novo simulado').click();
  await button(page, 'Excluir Simulado local').click();
  await button(page.getByRole('dialog'), 'Excluir').click();
  await expect(page.getByText('Nenhum simulado ainda')).toBeVisible();
});

test('sessão avulsa, anotações, retorno pelo cabeçalho e descarte', async ({ workspace: page }) => {
  await navigate(page, 'Estudar agora');
  await page.getByLabel('Objetivo rápido').fill('Estudar regência');
  await button(page, '90 min').click();
  await button(page, 'Começar a estudar').click();
  await page.getByLabel('Notas rápidas durante o estudo').fill('Retomar capítulo 3');
  await navigate(page, 'Relatórios');
  await page.getByRole('button', { name: /^Em foco/ }).click();
  await expect(page.getByLabel('Notas rápidas durante o estudo')).toHaveValue('Retomar capítulo 3');
  await button(page, 'Descartar').click();
  await button(page.getByRole('dialog'), 'Cancelar').click();
  await expect(page.getByRole('timer')).toBeVisible();
  await button(page, 'Descartar').click();
  await button(page.getByRole('dialog'), 'Descartar sessão').click();
  await expect(button(page, 'Começar a estudar')).toBeVisible();
});

test('reordena tópicos, ativa, desativa, gerencia subtópicos e limpa a disciplina', async ({ workspace: page }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  const rows = page.locator('[data-sort-group="topics"] > [data-sort-id]');
  const id = await rows.first().getAttribute('data-sort-id');
  const row = page.locator('[data-sort-id="' + id + '"]');
  await button(row, 'Mover para baixo').click();
  await expect(rows.nth(1)).toHaveAttribute('data-sort-id', id!);
  await button(row, 'Mover para cima').click();
  await expect(rows.first()).toHaveAttribute('data-sort-id', id!);
  await button(row, 'Desativar tópico').click();
  await button(row, 'Ativar tópico').click();
  await button(row, 'Adicionar subtópico').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título do Subtópico').fill('Subtópico E2E');
  await button(dialog, 'Criar').click();
  await expect(dialog).toHaveCount(0);
  if (await row.getByTitle('Expandir subtópicos').isVisible()) await row.getByTitle('Expandir subtópicos').click();
  const child = row.locator('[data-sort-id]').filter({ hasText: 'Subtópico E2E' });
  await button(child, 'Editar subtópico').click();
  await dialog.getByLabel('Título do Subtópico').fill('Subtópico E2E revisado');
  await button(dialog, 'Salvar').click();
  await button(child, 'Excluir subtópico').click();
  await button(dialog, 'Excluir Tópico').click();
  await expect(child).toHaveCount(0);
  await button(page, 'Excluir tópicos').click();
  await button(dialog, 'Confirmar Exclusão').click();
  await expect(page.getByText('Nenhum tópico cadastrado nesta disciplina')).toBeVisible();
});

test('ciclo permite cancelar ou confirmar a remoção de uma atividade', async ({ workspace: page }) => {
  await navigate(page, 'Ciclo de estudos');
  const removal = page.getByRole('button', { name: /^Excluir sessão 2 de/ });
  const original = await removal.getAttribute('aria-label');
  await removal.click();
  await button(page.getByRole('dialog'), 'Cancelar').click();
  await button(page, original!).click();
  await button(page.getByRole('dialog'), 'Excluir sessão').click();
  await expect(button(page, original!)).toHaveCount(0);
});

test('simulado certo ou errado aceita gabarito em texto, resposta em branco e caderno em lote', async ({ workspace: page }) => {
  await navigate(page, 'Simulados');
  await page.getByLabel('Nome do simulado').fill('Prova C/E');
  await page.getByRole('combobox', { name: 'Alternativas por questão' }).click();
  await page.getByRole('option', { name: /Certo ou Errado/ }).click();
  await page.getByText('Prefere colar ou corrigir o gabarito em texto?').click();
  await page.getByLabel('Gabarito (texto)').fill('1 C\n2 E');
  await page.getByText('Opcional: informar as disciplinas por faixa de questões').click();
  await button(page, 'Adicionar faixa').click();
  await expect(page.getByLabel('Até a questão')).toHaveValue('2');
  await button(page, 'Gerar folha de respostas').click();
  await page.getByRole('radiogroup', { name: 'Questão 1', exact: true }).getByText('Errado').click();
  await button(page, 'Enviar respostas').click();
  await button(page.getByRole('dialog'), 'Voltar e marcar').click();
  await button(page, 'Enviar respostas').click();
  await button(page.getByRole('dialog'), 'Enviar mesmo assim').click();
  await expect(page.getByTestId('exam-result')).toContainText('0%');
  const subjects = page.getByRole('group', { name: 'Matérias com erros' });
  await subjects.getByText('Língua Portuguesa').click();
  await button(page, 'Criar 1 caderno em lote').click();
  await expect(page.getByText('Cadernos vinculados a esta prova (1)')).toBeVisible();
});

test('arrastar um tópico reordena a lista e mantém a ordem após recarga', async ({ workspace: page }) => {
  await navigate(page, 'Disciplinas e conteúdos');
  const rows = page.locator('[data-sort-group="topics"] > [data-sort-id]');
  const id = await rows.first().getAttribute('data-sort-id');
  await rows.nth(2).scrollIntoViewIfNeeded();
  const start = await rows.first().locator('[data-drag-handle]').first().boundingBox();
  const target = await rows.nth(1).boundingBox();
  expect(start).toBeTruthy();
  expect(target).toBeTruthy();
  const x = start!.x + start!.width / 2;
  await page.mouse.move(x, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, target!.y + target!.height * 0.9, { steps: 12 });
  await page.mouse.up();
  await expect(rows.nth(1)).toHaveAttribute('data-sort-id', id!);
  await page.reload();
  await page.getByTestId('contest-card-default').click();
  await expect(rows.nth(1)).toHaveAttribute('data-sort-id', id!);
});

test('confirma duplicata intencional e vincula aprendizado ao lançamento', async ({ workspace: page }) => {
  await navigate(page, 'Questões');
  const dialog = page.getByRole('dialog');
  for (let attempt = 0; attempt < 2; attempt++) {
    await button(page, 'Registrar questões').first().click();
    await chooseDiscipline(page);
    await dialog.getByLabel('Banca ou fonte').fill('Prova de outubro');
    await dialog.getByLabel('Erros', { exact: true }).fill('1');
    await button(dialog, 'Registrar questões').click();
    if (attempt === 1) await button(dialog, 'Salvar mesmo assim').click();
    await expect(dialog).toHaveCount(0);
  }
  const addNote = button(page, 'Registrar aprendizado no Caderno de Erros');
  await expect(addNote).toHaveCount(2);
  await addNote.first().click();
  await dialog.getByLabel('Identificação da questão').fill('Prova de outubro Q7');
  await button(dialog, 'Salvar no caderno').click();
  await button(page, 'Ver/Editar anotação no Caderno de Erros').click();
  await expect(dialog.getByLabel('Identificação da questão')).toHaveValue('Prova de outubro Q7');
});
