import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { Alert, Card } from '../ui/Display';
import { Field, Input, Select, Textarea } from '../ui/Form';
import { FileDropzone } from './FileDropzone';
import { parseAnswerKey, validateRanges } from '../../domain/mockExam';
import { readFileText } from '../../services/fileText';
import { createMockExam } from '../../services/mockExams';
import type { Discipline, MockExam, MockExamRange } from '../../db/types';
import { errorMessage } from '../../lib/utils';

interface ExamSetupProps {
  disciplines: Discipline[];
  onCreated: (exam: MockExam) => void;
}

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');

export function ExamSetup({ disciplines, onCreated }: ExamSetupProps) {
  const [title, setTitle] = useState('');
  const [examFile, setExamFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [keyText, setKeyText] = useState('');
  const [optionCount, setOptionCount] = useState(5);
  const [ranges, setRanges] = useState<MockExamRange[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // O gabarito é lido automaticamente sempre que o texto ou o formato da prova muda.
  const parsed = useMemo(() => (keyText.trim() ? parseAnswerKey(keyText, optionCount) : null), [keyText, optionCount]);
  const keyOk = parsed !== null && parsed.questionCount > 0;
  const rangeErrors = parsed ? validateRanges(ranges, parsed.questionCount) : [];
  const nameOk = title.trim().length > 0;
  const ready = keyOk && nameOk && rangeErrors.length === 0;

  const onExamFile = (file: File | null) => {
    setExamFile(file);
    if (file && !title.trim()) setTitle(stripExtension(file.name));
  };

  const onKeyFile = async (file: File | null) => {
    setKeyFile(file);
    setFileError(null);
    setRanges([]);
    if (!file) {
      setKeyText('');
      return;
    }
    try {
      setKeyText(await readFileText(file));
    } catch (e) {
      setKeyText('');
      setFileError(errorMessage(e));
    }
  };

  const updateRange = (index: number, patch: Partial<MockExamRange>) =>
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRange = () => {
    if (!parsed) return;
    const last = ranges.reduce((max, r) => Math.max(max, r.to), 0);
    const from = Math.min(last + 1, parsed.questionCount);
    setRanges((prev) => [...prev, { from, to: parsed.questionCount, disciplineId: disciplines[0]?.id ?? '' }]);
  };

  const create = async () => {
    if (!parsed) return;
    setSaving(true);
    setSubmitError(null);
    try {
      const exam = await createMockExam({
        title,
        examFileName: examFile?.name ?? null,
        keyFileName: keyFile?.name ?? null,
        answerKey: parsed.key,
        questionCount: parsed.questionCount,
        optionCount,
        ranges,
      });
      onCreated(exam);
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const checklist = [
    { done: nameOk, text: 'Dê um nome ao simulado' },
    { done: keyOk, text: 'Envie ou cole o gabarito' },
  ];

  return (
    <Card title="Enviar prova e gabarito" description="Seus arquivos são lidos no próprio navegador e não são enviados a nenhum servidor.">
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <FileDropzone
            label="Prova"
            hint="PDF ou outro formato — fica só como referência"
            file={examFile}
            onFile={onExamFile}
          />
          <FileDropzone
            label="Gabarito"
            hint="PDF, TXT ou CSV com as respostas certas"
            accept=".pdf,.txt,.csv,text/plain,application/pdf"
            file={keyFile}
            required
            onFile={(f) => void onKeyFile(f)}
          />
        </div>

        {fileError && <Alert tone="danger" onClose={() => setFileError(null)}>{fileError}</Alert>}

        <details className="group rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-fg-muted select-none focus-visible:ring-2 focus-visible:ring-primary">
            Prefere colar ou corrigir o gabarito em texto?
          </summary>
          <div className="mt-3">
            <Field
              label="Gabarito (texto)"
              hint={
                optionCount === 2
                  ? 'Uma questão por linha, ex.: 1-C, 2-E, 3-Certo, 4-Errado. Use X para questão anulada.'
                  : 'Uma questão por linha, ex.: 1-A, 2-C, 3-B. Use X para questão anulada.'
              }
            >
              <Textarea
                rows={5}
                value={keyText}
                onChange={(e) => {
                  setKeyText(e.target.value);
                  setRanges([]);
                }}
                placeholder={optionCount === 2 ? '1 C\n2 E\n3 C' : '1 A\n2 C\n3 B'}
              />
            </Field>
          </div>
        </details>

        {parsed && !keyOk && <Alert tone="danger">{parsed.warnings[0]}</Alert>}
        {keyOk && parsed && (
          <div className="flex flex-col gap-2">
            <Alert tone="success" title={`${parsed.questionCount} questões identificadas`}>
              O gabarito foi lido. Confira o nome e crie a folha de respostas.
            </Alert>
            {parsed.warnings.map((w) => (
              <Alert key={w} tone="warning">
                {w}
              </Alert>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do simulado" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Simulado BNB 01" />
          </Field>
          <Field label="Alternativas por questão">
            <Select value={optionCount} onChange={(e) => setOptionCount(Number(e.target.value))}>
              <option value={2}>Certo ou Errado (C–E)</option>
              <option value={4}>4 alternativas (A–D)</option>
              <option value={5}>5 alternativas (A–E)</option>
            </Select>
          </Field>
        </div>

        {keyOk && parsed && (
          <details className="rounded-lg border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium text-fg-muted select-none focus-visible:ring-2 focus-visible:ring-primary">
              Opcional: informar as disciplinas por faixa de questões
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-xs text-fg-subtle">Com isso, o resultado mostra seu desempenho em cada disciplina.</p>
              {ranges.map((r, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <Field label="Da questão" className="w-28">
                    <Input type="number" min={1} value={r.from} onChange={(e) => updateRange(i, { from: Number(e.target.value) })} />
                  </Field>
                  <Field label="Até a questão" className="w-28">
                    <Input type="number" min={1} value={r.to} onChange={(e) => updateRange(i, { to: Number(e.target.value) })} />
                  </Field>
                  <Field label="Disciplina" className="min-w-48 flex-1">
                    <Select value={r.disciplineId} onChange={(e) => updateRange(i, { disciplineId: e.target.value })}>
                      {disciplines.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <IconButton
                    label="Remover faixa"
                    icon={<Trash2 className="size-4" />}
                    onClick={() => setRanges((prev) => prev.filter((_, idx) => idx !== i))}
                  />
                </div>
              ))}
              {rangeErrors.map((e) => (
                <p key={e} className="text-xs font-medium text-danger" role="alert">
                  {e}
                </p>
              ))}
              <div>
                <Button size="sm" icon={<Plus className="size-4" />} onClick={addRange}>
                  Adicionar faixa
                </Button>
              </div>
            </div>
          </details>
        )}

        {submitError && <Alert tone="danger" onClose={() => setSubmitError(null)}>{submitError}</Alert>}

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-col gap-1 text-xs" aria-label="O que falta para continuar">
            {checklist.map((item) => (
              <li key={item.text} className={item.done ? 'flex items-center gap-1.5 text-success' : 'flex items-center gap-1.5 text-fg-muted'}>
                {item.done ? <CheckCircle2 className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
                <span>{item.text}</span>
                {item.done && <span className="sr-only"> (concluído)</span>}
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            icon={<ArrowRight className="size-4" />}
            loading={saving}
            disabled={!ready}
            onClick={() => void create()}
            className="sm:min-w-56"
          >
            Gerar folha de respostas
          </Button>
        </div>
      </div>
    </Card>
  );
}
