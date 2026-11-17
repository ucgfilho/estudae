import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { todayKey } from '../../lib/dates';
import { ToastProvider } from '../../components/ui/Toast';
import { ReviewsScreen } from '../../screens/ReviewsScreen';
import { db, resetDatabase } from '../../db/db';
import { FlashcardDeck } from '../../components/reviews/FlashcardDeck';
import type { Discipline, ErrorNote, ReviewTask } from '../../db/types';

describe('FlashcardDeck progress bar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const makeDisciplines = (): Map<string, Discipline> => {
    return new Map([
      [
        'disc-1',
        {
          id: 'disc-1',
          name: 'Linguagens e Tecnologias de Programação',
          color: '#10b981',
          active: true,
          order: 1,
          kind: 'technical',
        },
      ],
    ]);
  };

  const makeNotes = (count: number): Map<string, ErrorNote> => {
    const notes = new Map<string, ErrorNote>();
    for (let i = 1; i <= count; i++) {
      notes.set(`note-${i}`, {
        id: `note-${i}`,
        questionLogId: null,
        disciplineId: 'disc-1',
        topicId: null,
        sourceReference: `Prova 2026 questão ${i}`,
        errorType: 'desatencao',
        explanation: `Explicação ${i}`,
        errorDate: '2026-11-17',
        status: 'revisar',
        nextReviewDate: '2026-11-17',
        flashcards: [
          {
            id: `card-${i}`,
            statement: `Enunciado da questão ${i}`,
            answer: 'certo',
            explanation: `Explicação ${i}`,
            createdAt: '2026-11-17T10:00:00Z',
          },
        ],
        createdAt: '2026-11-17T10:00:00Z',
        updatedAt: '2026-11-17T10:00:00Z',
      });
    }
    return notes;
  };

  const makeReviews = (count: number): ReviewTask[] => {
    const list: ReviewTask[] = [];
    for (let i = 1; i <= count; i++) {
      list.push({
        id: `rev-${i}`,
        disciplineId: 'disc-1',
        topicId: null,
        title: `Revisão ${i}`,
        dueDate: '2026-11-17',
        intervalDays: 1,
        status: 'pendente',
        errorNoteId: `note-${i}`,
        completedAt: null,
        createdAt: '2026-11-16T10:00:00Z',
      });
    }
    return list;
  };

  it('renders initial progress at 0% when starting 24 reviews', () => {
    const reviews = makeReviews(24);
    const notes = makeNotes(24);
    const disciplines = makeDisciplines();

    render(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/Revisão 1 de 24/i)).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '0');
    const fill = progressbar.firstElementChild as HTMLElement;
    expect(fill).toHaveStyle({ width: '0%' });
  });

  it('calculates progress correctly at review 14 of 24 (13 done) instead of 100%', () => {
    const today = todayKey();
    const reviews = makeReviews(24);
    const notes = makeNotes(24);
    const disciplines = makeDisciplines();

    // Simulate saved progress at review 14 (13 done out of 24)
    localStorage.setItem(
      `flashcard-deck-progress-${today}:local:default`,
      JSON.stringify({
        version: 3,
        completedReviewIds: reviews.slice(0, 13).map(r => r.id),
        missedFlashcards: [], redoQueue: [],
        cardIndex: 0,
        reviewStats: { hits: 0, misses: 0 },
        streak: 3,
        totalHits: 10,
        totalCardsAnswered: 13,
        reviewIds: reviews.map((r) => r.id),
        date: today,
      })
    );

    render(
      <FlashcardDeck
        reviews={reviews.slice(13)}
        notes={notes}
        disciplines={disciplines}
        onComplete={vi.fn()}
      />
    );

    expect(screen.getByText(/Revisão 14 de 24/i)).toBeInTheDocument();
    const progressbar = screen.getByRole('progressbar');
    // 13 / 24 = 54%
    expect(progressbar).toHaveAttribute('aria-valuenow', '54');
    const fill = progressbar.firstElementChild as HTMLElement;
    expect(fill).toHaveStyle({ width: '54%' });
  });

  it('calculates progress accurately when reviews prop shrinks as items complete', async () => {
    let reviews = makeReviews(4);
    const notes = makeNotes(4);
    const disciplines = makeDisciplines();

    const onComplete = vi.fn().mockImplementation(async (r: ReviewTask) => {
      // Simulate parent component updating reviews prop by removing completed item
      reviews = reviews.filter((item) => item.id !== r.id);
    });

    const { rerender } = render(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={onComplete}
      />
    );

    // Initial: 0 of 4 -> 0%
    expect(screen.getByText(/Revisão 1 de 4/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    // Answer first card
    fireEvent.click(screen.getByRole('button', { name: /Certo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Próximo card/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    // Re-render with remaining reviews (3 left)
    rerender(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={onComplete}
      />
    );

    // After 1 of 4: 1 done, 4 total -> 25% (NOT 1/3 = 33%)
    await waitFor(() => {
      expect(screen.getByText(/Revisão 2 de 4/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(fill).toHaveStyle({ width: '25%' });
  });

  it('handles redo mode for missed flashcards with correct progress tracking', async () => {
    let reviews = makeReviews(2);
    const notes = makeNotes(2);
    const disciplines = makeDisciplines();

    const onComplete = vi.fn().mockImplementation(async (r: ReviewTask) => {
      reviews = reviews.filter((item) => item.id !== r.id);
    });

    const { rerender } = render(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={onComplete}
      />
    );

    // Card 1: mark as wrong (miss)
    fireEvent.click(screen.getByRole('button', { name: /Errado/i }));
    fireEvent.click(screen.getByRole('button', { name: /Próximo card/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));

    rerender(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={onComplete}
      />
    );

    // Card 2: mark as correct (hit)
    await waitFor(() => expect(screen.getByText(/Revisão 2 de 2/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Certo/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Finalizar$/i }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));

    rerender(
      <FlashcardDeck
        reviews={reviews}
        notes={notes}
        disciplines={disciplines}
        onComplete={onComplete}
      />
    );

    // Summary screen should offer redo for the 1 missed flashcard
    await waitFor(() => {
      expect(screen.getByText(/Primeira rodada concluída!/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Refazer os que errei \(1\)/i)).toBeInTheDocument();

    // Start redo mode
    fireEvent.click(screen.getByText(/Refazer os que errei \(1\)/i));

    // In redo mode: 1 error to redo
    await waitFor(() => {
      expect(screen.getByText(/Revisão de erros 1 de 1/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

    // Answer the missed card correctly
    fireEvent.click(screen.getByRole('button', { name: /Certo/i }));
    fireEvent.click(screen.getByRole('button', { name: /Finalizar revisão de erros/i }));

    // Completion screen
    await waitFor(() => {
      expect(screen.getByText(/Revisão do dia concluída!/i)).toBeInTheDocument();
    });
  });
  it('ignores inconsistent legacy counters and uses actual pending reviews', () => {
    localStorage.setItem(`flashcard-deck-progress-${todayKey()}:local:default`, JSON.stringify({
      totalReviews: 24, doneReviews: 99, reviewIds: ['rev-1'], date: todayKey(),
    }));
    render(<FlashcardDeck reviews={makeReviews(1)} notes={makeNotes(1)} disciplines={makeDisciplines()} onComplete={vi.fn()} />);
    expect(screen.getByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('preserves partial cards, answers and missed cards after reloading', async () => {
    const reviews = makeReviews(1);
    const notes = makeNotes(1);
    notes.get('note-1')!.flashcards!.push({ ...notes.get('note-1')!.flashcards![0], id: 'card-2', statement: 'Segundo flashcard' });
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const props = { reviews, notes, disciplines: makeDisciplines(), onComplete };
    const first = render(<FlashcardDeck {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Errado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo flashcard' }));
    expect(await screen.findByText('Segundo flashcard')).toBeInTheDocument();
    first.unmount();
    const second = render(<FlashcardDeck {...props} />);
    expect(screen.getByText('Segundo flashcard')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    second.unmount();
    const third = render(<FlashcardDeck {...props} />);
    expect(screen.getByText('Você acertou!')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByText('Primeira rodada concluída!')).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledWith(reviews[0], { hits: 1, misses: 1 });
    third.unmount();
    render(<FlashcardDeck {...props} reviews={[]} />);
    expect(screen.getByRole('button', { name: /Refazer os que errei/ })).toBeInTheDocument();
  });

  it('keeps retrying wrong answers and celebrates only after every error is correct', async () => {
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<FlashcardDeck reviews={makeReviews(1)} notes={makeNotes(1)} disciplines={makeDisciplines()} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Errado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    fireEvent.click(await screen.findByRole('button', { name: /Refazer os que errei/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Errado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar revisão de erros' }));
    expect(await screen.findByText('Revisão de erros 1 de 1')).toBeInTheDocument();
    expect(screen.queryByText(/Conquista desbloqueada/)).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar revisão de erros' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not award mastery when the student declines retrying', async () => {
    render(<FlashcardDeck reviews={makeReviews(1)} notes={makeNotes(1)} disciplines={makeDisciplines()} onComplete={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Errado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Finalizar mesmo assim' }));
    expect(screen.getByText('Sessão concluída!')).toBeInTheDocument();
    expect(screen.queryByText(/Conquista desbloqueada/)).not.toBeInTheDocument();
  });

  it('retains the answer and counter when saving fails, allowing another attempt', async () => {
    const onComplete = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    render(<FlashcardDeck reviews={makeReviews(1)} notes={makeNotes(1)} disciplines={makeDisciplines()} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByRole('button', { name: 'Finalizar' })).toBeEnabled();
    expect(screen.getByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.queryByText(/Conquista desbloqueada/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('offers retries on ReviewsScreen after the last due task leaves the database queue', async () => {
    await resetDatabase(db);
    const review = { ...makeReviews(1)[0], dueDate: todayKey() };
    const note = { ...makeNotes(1).get('note-1')!, nextReviewDate: todayKey() };
    await db.disciplines.put(makeDisciplines().get('disc-1')!);
    await db.errorNotes.put(note);
    await db.reviews.put(review);
    render(<ToastProvider><ReviewsScreen /></ToastProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Errado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByRole('button', { name: /Refazer os que errei/ })).toBeInTheDocument();
    expect((await db.reviews.get(review.id))?.status).toBe('concluida');
    fireEvent.click(screen.getByRole('button', { name: /Refazer os que errei/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar revisão de erros' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
    const tasks = await db.reviews.toArray();
    expect(tasks.filter(r => r.status === 'concluida')).toHaveLength(1);
    expect(tasks.filter(r => r.status === 'pendente')).toHaveLength(1);
  });

  it('starts at one of one with thirty previously completed reviews in the database', async () => {
    await resetDatabase(db);
    await db.disciplines.put(makeDisciplines().get('disc-1')!);
    await db.errorNotes.put({ ...makeNotes(1).get('note-1')!, nextReviewDate: todayKey() });
    await db.reviews.bulkPut(makeReviews(31).map((r, i) => i === 30
      ? { ...r, errorNoteId: 'note-1', dueDate: todayKey() }
      : { ...r, errorNoteId: null, status: 'concluida', completedAt: new Date().toISOString() }));
    render(<ToastProvider><ReviewsScreen /></ToastProvider>);
    expect(await screen.findByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('does not import counters from a finished v2 session into a new pending review', () => {
    localStorage.setItem(`flashcard-deck-progress-${todayKey()}:local:default`, JSON.stringify({
      version: 2, activeReview: null, completedReviewIds: makeReviews(30).map(r => r.id),
      missedFlashcards: [], redoQueue: [], totalCardsAnswered: 30, totalHits: 30, streak: 30,
    }));
    render(<FlashcardDeck reviews={makeReviews(31).slice(30)} notes={makeNotes(31)} disciplines={makeDisciplines()} onComplete={vi.fn()} />);
    expect(screen.getByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText(/em sequência/)).not.toBeInTheDocument();
  });

  it('starts a fresh session after a completed round, both on reload and while mounted', async () => {
    const props = { reviews: makeReviews(1), notes: makeNotes(2), disciplines: makeDisciplines(), onComplete: vi.fn().mockResolvedValue(undefined) };
    const first = render(<FlashcardDeck {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
    first.unmount();
    // Reopen the very same task after finishing its prior round.
    const second = render(<FlashcardDeck {...props} />);
    expect(screen.getByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText(/em sequência/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
    // A newly scheduled task also starts at zero without leaving the screen.
    second.rerender(<FlashcardDeck {...props} reviews={makeReviews(2).slice(1)} />);
    expect(screen.getByText('Revisão 1 de 1')).toBeInTheDocument();
    expect(screen.getByText('Enunciado da questão 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText(/em sequência/)).not.toBeInTheDocument();
  });

  it('shows the streak only after a hit and hides it immediately on a miss', async () => {
    render(<FlashcardDeck reviews={makeReviews(2)} notes={makeNotes(2)} disciplines={makeDisciplines()} onComplete={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.queryByText(/em sequência/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    expect(screen.getByText('1 em sequência')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo card' }));
    expect(await screen.findByText('Revisão 2 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Errado' }));
    expect(screen.queryByText(/em sequência/)).not.toBeInTheDocument();
  });

  it('labels only the last flashcard of the last review as Finalizar', async () => {
    const notes = makeNotes(2);
    notes.get('note-2')!.flashcards!.push({ ...notes.get('note-2')!.flashcards![0], id: 'last-card', statement: 'Último flashcard' });
    render(<FlashcardDeck reviews={makeReviews(2)} notes={notes} disciplines={makeDisciplines()} onComplete={vi.fn().mockResolvedValue(undefined)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    expect(screen.queryByRole('button', { name: 'Finalizar' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo card' }));
    expect(await screen.findByText('Revisão 2 de 2 · Flashcard 1 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próximo flashcard' }));
    expect(await screen.findByText('Último flashcard')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Certo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar' }));
    expect(await screen.findByText(/Conquista desbloqueada/)).toBeInTheDocument();
  });

});
