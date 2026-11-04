import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../ui/Dialog';
import { InputWithIcon } from '../ui/Form';
import { useTopics, useDisciplines, useSessions, useErrorNotes } from '../../hooks/useData';
import { Search, BookOpen, Calendar, AlertOctagon, ArrowRight } from 'lucide-react';
import { formatDate } from '../../lib/dates';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const topics = useTopics();
  const disciplines = useDisciplines();
  const sessions = useSessions();
  const errorNotes = useErrorNotes();

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const discMap = useMemo(() => new Map(disciplines.map((d) => [d.id, d])), [disciplines]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { topics: [], sessions: [], errorNotes: [] };

    const matchedTopics = topics
      .filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q))
      .slice(0, 5);

    const matchedSessions = sessions
      .filter((s) => s.objective.toLowerCase().includes(q) || s.notes.toLowerCase().includes(q))
      .slice(0, 5);

    const matchedErrors = errorNotes
      .filter(
        (e) =>
          e.explanation.toLowerCase().includes(q) ||
          e.sourceReference.toLowerCase().includes(q)
      )
      .slice(0, 5);

    return { topics: matchedTopics, sessions: matchedSessions, errorNotes: matchedErrors };
  }, [query, topics, sessions, errorNotes]);

  const totalResults = results.topics.length + results.sessions.length + results.errorNotes.length;

  return (
    <Dialog open={open} onClose={onClose} title="Busca Rápida no Conteúdo" size="md">
      <div className="space-y-4">
        <InputWithIcon
          type="search"
          icon={<Search className="size-4" />}
          placeholder="Buscar por tópico, objetivo, anotação ou erro..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {query.trim() && totalResults === 0 && (
          <p className="py-6 text-center text-sm text-fg-muted">
            Nenhum resultado encontrado para &quot;{query}&quot;.
          </p>
        )}

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {results.topics.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 mb-2">
                <BookOpen className="size-3.5" /> Tópicos
              </div>
              <div className="space-y-1">
                {results.topics.map((t) => {
                  const d = discMap.get(t.disciplineId);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/disciplinas');
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-muted flex items-center justify-between text-sm group"
                    >
                      <div>
                        <div className="font-medium text-fg">{t.title}</div>
                        <div className="text-xs text-fg-muted">{d?.name}</div>
                      </div>
                      <ArrowRight className="size-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {results.sessions.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 mb-2">
                <Calendar className="size-3.5" /> Sessões de Estudo
              </div>
              <div className="space-y-1">
                {results.sessions.map((s) => {
                  const d = discMap.get(s.disciplineId);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/calendario');
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-muted flex items-center justify-between text-sm group"
                    >
                      <div>
                        <div className="font-medium text-fg">{s.objective || 'Sessão de estudo'}</div>
                        <div className="text-xs text-fg-muted">
                          {formatDate(s.date)} • {d?.name} ({s.plannedMinutes} min)
                        </div>
                      </div>
                      <ArrowRight className="size-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {results.errorNotes.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-subtle flex items-center gap-1.5 mb-2">
                <AlertOctagon className="size-3.5" /> Caderno de Erros
              </div>
              <div className="space-y-1">
                {results.errorNotes.map((e) => {
                  const d = discMap.get(e.disciplineId);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/erros');
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-surface-muted flex items-center justify-between text-sm group"
                    >
                      <div>
                        <div className="font-medium text-fg truncate max-w-sm">
                          {e.sourceReference || e.explanation.slice(0, 60)}
                        </div>
                        <div className="text-xs text-fg-muted">{d?.name}</div>
                      </div>
                      <ArrowRight className="size-4 text-fg-subtle opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
