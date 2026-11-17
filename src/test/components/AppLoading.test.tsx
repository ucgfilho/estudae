import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../../App';
import * as database from '../../db/db';
import * as contests from '../../services/contests';
import { setAuthSession } from '../../services/auth';

afterEach(() => {
  vi.restoreAllMocks();
  setAuthSession(null);
  window.localStorage.clear();
});

it('shows the contest heading before synchronization and protects actions until data is ready', async () => {
  window.localStorage.clear();
  let finishInitialization!: () => void;
  const initialization = new Promise<void>((resolve) => { finishInitialization = resolve; });
  vi.spyOn(database, 'ensureSeed').mockReturnValue(initialization);
  const switchContest = vi.spyOn(contests, 'switchActiveContest');
  setAuthSession({
    token: 'loading-test-token', tokenType: 'Bearer', expiresIn: 86400,
    user: { id: 'loading-test', name: 'Teste', email: 'loading@example.test', createdAt: '2026-11-17T00:00:00Z' },
  });

  render(<App />);

  expect(screen.getByRole('heading', { name: 'Qual concurso você vai estudar agora?' })).toBeVisible();
  const card = screen.getByTestId('contest-card-default');
  expect(card.parentElement).toHaveAttribute('inert');
  expect(screen.getByTestId('selector-profile-button')).toBeDisabled();
  fireEvent.click(card);
  expect(switchContest).not.toHaveBeenCalled();

  await act(async () => { finishInitialization(); });

  expect(card.parentElement).not.toHaveAttribute('inert');
  expect(screen.getByTestId('selector-profile-button')).toBeEnabled();
});
