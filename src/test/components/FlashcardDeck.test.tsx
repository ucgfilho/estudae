import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    const today = new Date().toISOString().split('T')[0];
    const reviews = makeReviews(24);
    const notes = makeNotes(24);
    const disciplines = makeDisciplines();

    // Simulate saved progress at review 14 (13 done out of 24)
    localStorage.setItem(
      `flashcard-deck-progress-${today}`,
      JSON.stringify({
        totalReviews: 24,
        doneReviews: 13,
        cardIndex: 0,
        reviewStats: { hits: 10, misses: 3 },
        streak: 3,
        totalHits: 10,
        totalCardsAnswered: 13,
        reviewIds: reviews.map((r) => r.id),
        date: today,
      })
    );

    render(
      <FlashcardDeck
        reviews={reviews}
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
    fireEvent.click(screen.getByRole('button', { name: /Próximo card/i }));
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
});
