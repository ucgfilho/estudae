import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Display';
import { Field, Input, Select, Checkbox } from '../ui/Form';
import { RichTextEditor } from '../ui/RichText';
import { useDisciplines, useTopics, useErrorNotes, useMockExams } from '../../hooks/useData';
import { saveErrorNote, type ErrorNoteInput } from '../../services/performance';
import {
  ERROR_TYPE_LABELS,
  ERROR_STATUS_LABELS,
  type ErrorNote,
  type ErrorType,
  type ErrorStatus,
} from '../../db/types';
import { formatDate, todayKey } from '../../lib/dates';
import { errorMessage } from '../../lib/utils';
import { DateInput } from '../ui/DateInput';

interface ErrorNoteModalProps {
  open: boolean;
  onClose: () => void;
  noteToEdit?: ErrorNote | null;
  defaultDate?: string;
  defaultDisciplineId?: string;
  defaultTopicId?: string | null;
  questionLogId?: string | null;
  /** Simulado ao qual o novo caderno será vinculado automaticamente. */
  mockExam?: { id: string; title: string } | null;
  onSaved?: (saved: ErrorNote) => void;
}

export function ErrorNoteModal({
  open,
  onClose,
  noteToEdit,
  defaultDate,
  defaultDisciplineId,
  defaultTopicId,
  questionLogId,
  mockExam,
  onSaved,
}: ErrorNoteModalProps) {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const errorNotes = useErrorNotes();
  const mockExams = useMockExams();

  const effectiveNote = useMemo(() => {
    if (noteToEdit) return noteToEdit;
    if (questionLogId) {
      return errorNotes.find((n) => n.questionLogId === questionLogId) ?? null;
    }
    return null;
  }, [noteToEdit, questionLogId, errorNotes]);

  // Simulados disponíveis para vinculação (prioriza finalizados/submetidos)
  const availableExams = useMemo(() => {
    const list = [...mockExams];
    if (mockExam && !list.some((e) => e.id === mockExam.id)) {
      list.push({
        id: mockExam.id,
        title: mockExam.title,
        questionCount: 0,
        optionCount: 4,
        answerKey: {},
        ranges: [],
        responses: {},
        examFileName: null,
        keyFileName: null,
        submittedAt: null,
        createdAt: '',
        updatedAt: '',
      });
    }
    return list.sort((a, b) => {
      // Submetidos primeiro, depois por data mais recente
      if (Boolean(a.submittedAt) !== Boolean(b.submittedAt)) {
        return a.submittedAt ? -1 : 1;
      }
      const dateA = a.date ?? a.createdAt;
      const dateB = b.date ?? b.createdAt;
      return dateB.localeCompare(dateA);
    });
  }, [mockExams, mockExam]);

  const [disciplineId, setDisciplineId] = useState(defaultDisciplineId || '');
  const [topicId, setTopicId] = useState(defaultTopicId || '');
  const [selectedMockExamId, setSelectedMockExamId] = useState('');
  const [questionReference, setQuestionReference] = useState('');
  const [errorType, setErrorType] = useState<ErrorType>('falta-conteudo');
  const [explanation, setExplanation] = useState('');
  const [errorDate, setErrorDate] = useState(defaultDate || todayKey());
  const [status, setStatus] = useState<ErrorStatus>('revisar');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [scheduleReviews, setScheduleReviews] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (effectiveNote) {
      setDisciplineId(effectiveNote.disciplineId);
      setTopicId(effectiveNote.topicId || '');
      setSelectedMockExamId(effectiveNote.mockExamId || '');

      // Extrai detalhe da questão se a referência começar com o título do simulado
      if (effectiveNote.mockExamTitle) {
        const prefix = `${effectiveNote.mockExamTitle} · `;
        if (effectiveNote.sourceReference.startsWith(prefix)) {
          setQuestionReference(effectiveNote.sourceReference.slice(prefix.length));
        } else if (effectiveNote.sourceReference === effectiveNote.mockExamTitle) {
          setQuestionReference('');
        } else {
          setQuestionReference(effectiveNote.sourceReference);
        }
      } else {
        setQuestionReference(effectiveNote.sourceReference);
      }

      setErrorType(effectiveNote.errorType);
      setExplanation(effectiveNote.explanation);
      setErrorDate(effectiveNote.errorDate);
      setStatus(effectiveNote.status);
      setNextReviewDate(effectiveNote.nextReviewDate || '');
      setScheduleReviews(false);
    } else {
      setDisciplineId(defaultDisciplineId || (disciplines[0]?.id ?? ''));
      setTopicId(defaultTopicId || '');
      setSelectedMockExamId(mockExam?.id || '');
      setQuestionReference('');
      setErrorType('falta-conteudo');
      setExplanation('');
      setErrorDate(defaultDate || todayKey());
      setStatus('revisar');
      setNextReviewDate('');
      setScheduleReviews(true);
    }
    setError(null);
  }, [open, effectiveNote, defaultDate, defaultDisciplineId, defaultTopicId, disciplines, mockExam?.id]);

  const filteredTopics = topics.filter(
    (t) => t.disciplineId === disciplineId && t.active && !t.parentTopicId
  );

  const selectedExam = useMemo(
    () => availableExams.find((e) => e.id === selectedMockExamId) ?? null,
    [availableExams, selectedMockExamId]
  );

  const handleExamChange = (newExamId: string) => {
    setSelectedMockExamId(newExamId);
    const chosen = availableExams.find((e) => e.id === newExamId);
    if (chosen?.date && !effectiveNote) {
      setErrorDate(chosen.date);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!disciplineId) {
      setError('Selecione uma disciplina.');
      return;
    }

    const rawRef = questionReference.trim();
    const normalizedRef = /^\d+$/.test(rawRef)
      ? `questão ${rawRef}`
      : /^q\.?\s*#?(\d+)$/i.test(rawRef)
      ? `questão ${rawRef.replace(/^q\.?\s*#?/i, '')}`
      : rawRef;

    let effectiveQuestionRef = normalizedRef;
    if (!effectiveQuestionRef && explanation.trim()) {
      const match = explanation.match(/(?:quest[aã]o|q\.?)\s*#?(\d+)/i);
      if (match?.[1]) {
        effectiveQuestionRef = `questão ${match[1]}`;
      }
    }

    if (selectedExam && !effectiveQuestionRef) {
      setError('Informe o número da questão desta prova (ex: questão 54).');
      return;
    }

    const finalSourceRef = selectedExam
      ? `${selectedExam.title} · ${effectiveQuestionRef}`
      : effectiveQuestionRef;

    if (!finalSourceRef && !explanation.trim()) {
      setError('Informe a referência da questão ou a explicação do aprendizado.');
      return;
    }

    const input: ErrorNoteInput = {
      disciplineId,
      topicId: topicId || null,
      questionLogId: effectiveNote?.questionLogId || questionLogId || null,
      sourceReference: finalSourceRef,
      errorType,
      explanation: explanation.trim(),
      errorDate,
      status,
      nextReviewDate: nextReviewDate.trim() || null,
      mockExamId: selectedExam ? selectedExam.id : null,
      mockExamTitle: selectedExam ? selectedExam.title : null,
    };

    setLoading(true);
    try {
      const saved = await saveErrorNote(input, {
        id: effectiveNote?.id,
        scheduleReviews: !effectiveNote && scheduleReviews,
      });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={effectiveNote ? 'Editar Anotação de Erro' : 'Adicionar ao Caderno de Erros'}
      description={
        selectedExam
          ? `Vinculado à prova "${selectedExam.title}".`
          : 'Cadastre o erro para gerar revisões espaçadas no cronograma.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="error-note-form" loading={loading}>
            {effectiveNote ? 'Salvar Alterações' : 'Salvar no Caderno'}
          </Button>
        </>
      }
    >
      <form id="error-note-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <Alert tone="danger" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Disciplina" required>
            <Select
              value={disciplineId}
              onChange={(e) => {
                setDisciplineId(e.target.value);
                setTopicId('');
              }}
              required
            >
              <option value="" disabled>Selecione uma disciplina</option>
              {disciplines.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Tópico" hint="Opcional">
            <Select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={!disciplineId || filteredTopics.length === 0}
            >
              <option value="">Geral / Sem tópico</option>
              {filteredTopics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Motivo do erro">
            <Select value={errorType} onChange={(e) => setErrorType(e.target.value as ErrorType)}>
              {(Object.keys(ERROR_TYPE_LABELS) as ErrorType[]).map((type) => (
                <option key={type} value={type}>
                  {ERROR_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as ErrorStatus)}>
              {(Object.keys(ERROR_STATUS_LABELS) as ErrorStatus[]).map((st) => (
                <option key={st} value={st}>
                  {ERROR_STATUS_LABELS[st]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Simulado de referência (Prova)"
            hint={availableExams.length > 0 ? 'Escolha de qual prova é esta questão' : 'Nenhum simulado cadastrado'}
          >
            <Select
              value={selectedMockExamId}
              onChange={(e) => handleExamChange(e.target.value)}
            >
              <option value="">Nenhum (questão avulsa / outro concurso)</option>
              {availableExams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title}{exam.date ? ` · ${formatDate(exam.date)}` : ''}{!exam.submittedAt ? ' (em andamento)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Identificação da questão"
            required={Boolean(selectedExam)}
            hint={selectedExam ? 'Ex: questão 54 (ou apenas 54)' : 'Ex: Q12345 QConcursos, CESPE 2024'}
          >
            <Input
              type="text"
              placeholder={selectedExam ? 'Ex: questão 54' : 'Ex: CESPE 2024 BNB Q45'}
              value={questionReference}
              onChange={(e) => setQuestionReference(e.target.value)}
              required={Boolean(selectedExam)}
            />
          </Field>
        </div>

        <Field label="Explicação correta / Resumo do aprendizado" required hint="Qual era a pegadinha ou conceito fundamental que causou o erro?">
          <RichTextEditor
            rows={6}
            placeholder="Explique com suas palavras o porquê da alternativa correta e o que você aprendeu com o erro..."
            value={explanation}
            onChange={setExplanation}
            required
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Data do erro">
            <DateInput
              value={errorDate}
              onChange={(e) => setErrorDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Próxima data de revisão" hint={scheduleReviews ? 'Calculada automaticamente se repetição ativa' : 'Opcional'}>
            <DateInput
              value={nextReviewDate}
              onChange={(e) => setNextReviewDate(e.target.value)}
              disabled={scheduleReviews}
            />
          </Field>
        </div>

        {!noteToEdit && (
          <div className="rounded-lg border border-border bg-surface-muted/30 p-3">
            <Checkbox
              checked={scheduleReviews}
              onChange={(e) => setScheduleReviews(e.target.checked)}
              label="Agendar revisões espaçadas automaticamente"
              description="Cria lembretes de revisão futuros (1, 7 e 30 dias após a data do erro, ou conforme configurado)."
            />
          </div>
        )}
      </form>
    </Dialog>
  );
}
