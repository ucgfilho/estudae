import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Select } from '../../components/ui/Select';
import { Checkbox, Field, Radio } from '../../components/ui/Form';

describe('Custom Select Component (UI-UX Pro Max)', () => {
  it('associates the visible trigger with its field label, hint and error', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Disciplina" hint="Escolha uma disciplina." error="Selecione uma opção.">
        <Select defaultValue="">
          <option value="">Selecione</option>
          <option value="sql">Banco de dados</option>
        </Select>
      </Field>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Disciplina' });
    expect(screen.getByLabelText('Disciplina')).toBe(trigger);
    expect(trigger).toHaveAccessibleDescription('Escolha uma disciplina. Selecione uma opção.');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    await user.click(screen.getByText('Disciplina', { selector: 'label' }));
    expect(trigger).toHaveFocus();
  });

  it('renders custom trigger button with selected option label', () => {
    render(
      <Select value="opt2" onChange={vi.fn()}>
        <option value="opt1">Opção 1</option>
        <option value="opt2">Opção 2</option>
      </Select>
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('Opção 2');
  });

  it('opens custom popover on trigger click and selects an option', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <Select value="opt1" onChange={handleChange}>
        <option value="opt1">Opção 1</option>
        <option value="opt2">Opção 2</option>
        <option value="opt3">Opção 3</option>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Custom popover is now open
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    const option3 = screen.getByRole('option', { name: 'Opção 3' });
    await user.click(option3);

    expect(handleChange).toHaveBeenCalled();
    // Popover closes after selection
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('supports keyboard navigation with arrow keys and Enter', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <Select defaultValue="opt1" onChange={handleChange}>
        <option value="opt1">Primeira Opção</option>
        <option value="opt2">Segunda Opção</option>
        <option value="opt3">Terceira Opção</option>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    trigger.focus();

    // Arrow down opens dropdown
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Arrow down moves to next
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(handleChange).toHaveBeenCalled();
  });

  it('closes when pressing Escape', async () => {
    const user = userEvent.setup();

    render(
      <Select value="opt1" onChange={vi.fn()}>
        <option value="opt1">Opção 1</option>
        <option value="opt2">Opção 2</option>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps highlighted index on hover without resetting back to top option', async () => {
    const user = userEvent.setup();

    render(
      <Select value="opt1" onChange={vi.fn()}>
        <option value="opt1">Opção 1</option>
        <option value="opt2">Opção 2</option>
        <option value="opt3">Opção 3</option>
        <option value="opt4">Opção 4</option>
      </Select>
    );

    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    const option3 = screen.getByRole('option', { name: 'Opção 3' });
    await user.hover(option3);

    // Option 3 has the highlighted style and does not get snapped back to Option 1
    expect(option3).toHaveClass('bg-surface-muted');
  });
});

describe('Custom Checkbox and Radio Components', () => {
  it('renders custom checkbox and toggles checked state', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <Checkbox
        label="Aceitar termos"
        description="Termos e condições do concurso"
        onChange={handleChange}
      />
    );

    const checkbox = screen.getByLabelText(/Aceitar termos/i);
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(handleChange).toHaveBeenCalled();
  });

  it('renders custom radio and selects option', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <Radio
        name="test-group"
        value="radio1"
        label="Opção A"
        onChange={handleChange}
      />
    );

    const radio = screen.getByLabelText(/Opção A/i);
    expect(radio).not.toBeChecked();

    await user.click(radio);
    expect(handleChange).toHaveBeenCalled();
  });
});
