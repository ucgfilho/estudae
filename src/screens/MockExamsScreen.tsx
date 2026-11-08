import { useState } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { PageHeader, Card, Badge, EmptyState } from '../components/ui/Display';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { Field } from '../components/ui/Form';
import { DateInput } from '../components/ui/DateInput';
import { ExamSetup } from '../components/mockexam/ExamSetup';
import { AnswerSheet } from '../components/mockexam/AnswerSheet';
import { ExamResult } from '../components/mockexam/ExamResult';
import { Stepper } from '../components/mockexam/Stepper';
import { useDisciplines, useMockExams, useSettings } from '../hooks/useData';
import { deleteMockExam, updateMockExamDate } from '../services/mockExams';
import { isTrueFalseExam } from '../domain/mockExam';
import { formatDate, isValidDateKey, todayKey } from '../lib/dates';
import type { MockExam } from '../db/types';

export function MockExamsScreen() {
  const exams = useMockExams();
  const disciplines = useDisciplines();
  const settings = useSettings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<MockExam | null>(null);

  const selected = exams.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Simulados"
        description="Envie a prova e o gabarito, marque suas respostas e receba a correção com análise de desempenho."
        actions={
          selected && (
            <Button icon={<Plus className="size-4" />} onClick={() => setSelectedId(null)}>
              Novo simulado
            </Button>
          )
        }
      />

      <Stepper current={!selected ? 1 : selected.submittedAt ? 3 : 2} />

      {selected ? (
        <>
          <Card title={selected.title} description={[selected.examFileName, selected.keyFileName].filter(Boolean).join(' · ') || undefined}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-fg-muted">
                {selected.questionCount} questões · {isTrueFalseExam(selected.optionCount) ? 'Certo ou Errado' : `${selected.optionCount} alternativas`} · 3h alocadas no cronograma
              </p>
              <Field label="Data do simulado" className="w-full sm:w-48">
                <DateInput
                  value={selected.date ?? todayKey()}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    if (isValidDateKey(nextDate)) {
                      void updateMockExamDate(selected.id, nextDate);
                    }
                  }}
                />
              </Field>
            </div>
          </Card>
          {selected.submittedAt ? (
            <ExamResult exam={selected} disciplines={disciplines} accuracyGoal={settings?.accuracyGoal ?? 70} />
          ) : (
            <AnswerSheet exam={selected} disciplines={disciplines} />
          )}
        </>
      ) : (
        <>
          <ExamSetup disciplines={disciplines} onCreated={(exam) => setSelectedId(exam.id)} />
          <Card title="Simulados anteriores">
            {exams.length === 0 ? (
              <EmptyState icon={<FileText className="size-5" />} title="Nenhum simulado ainda" description="Os simulados que você criar aparecerão aqui." />
            ) : (
              <ul className="divide-y divide-border">
                {[...exams]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(e.id)}>
                        <span className="block truncate text-sm font-medium text-fg">{e.title}</span>
                        <span className="text-xs text-fg-subtle">
                          {e.questionCount} questões · {isTrueFalseExam(e.optionCount) ? 'Certo ou Errado' : `${e.optionCount} alternativas`}
                          {e.date ? ` · ${formatDate(e.date)}` : ''}
                        </span>
                      </button>
                      <Badge tone={e.submittedAt ? 'success' : 'warning'}>{e.submittedAt ? 'Enviado' : 'Em andamento'}</Badge>
                      <IconButton label={`Excluir ${e.title}`} icon={<Trash2 className="size-4" />} onClick={() => setToDelete(e)} />
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <ConfirmModal
        open={toDelete !== null}
        title="Excluir simulado"
        message={`Excluir "${toDelete?.title ?? ''}" e seu resultado? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) await deleteMockExam(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
