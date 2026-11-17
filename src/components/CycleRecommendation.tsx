import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDisciplines, useTopics, useSessions, useQuestionLogs, useErrorNotes, useSettings, useReviews, useActiveTimer } from '../hooks/useData';
import { cycleCompletions, nextCycleActivity, previewCycle } from '../domain/schedule';
import { startCycleTimer } from '../services/timer';
import { updateSettings } from '../services/settings';
import { todayKey } from '../lib/dates';
import { errorMessage } from '../lib/utils';
import { Card, Alert, DisciplineDot } from './ui/Display';
import { Button } from './ui/Button';
import { Field, Input } from './ui/Form';

export function CycleRecommendation({ showQueue = false }: { showQueue?: boolean }) {
  const disciplines = useDisciplines();
  const topics = useTopics();
  const sessions = useSessions();
  const questionLogs = useQuestionLogs();
  const errorNotes = useErrorNotes();
  const settings = useSettings();
  const reviews = useReviews();
  const timer = useActiveTimer();
  const navigate = useNavigate();
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!settings) return null;
  const input = { disciplines, topics, sessions, questionLogs, errorNotes, settings };
  const next = nextCycleActivity(input);
  const due = reviews.filter(r => r.status === 'pendente' && r.dueDate <= todayKey()).length;
  const queue = showQueue ? previewCycle(input, Math.max(7, disciplines.filter(d => d.active).length)) : [];
  async function start() {
    setError(null);
    setLoading(true);
    try {
      await startCycleTimer(minutes === '' ? undefined : Number(minutes));
      navigate('/estudar-agora');
    } catch (err) { setError(errorMessage(err)); }
    finally { setLoading(false); }
  }
  return <div className="space-y-4">
    {due > 0 && <Alert tone="warning" title="Revisões prioritárias">
      <Link to="/revisoes" className="underline">{due} revisão(ões) pendente(s) para hoje ou vencidas</Link>.
      Você pode revisá-las e depois continuar o ciclo da mesma posição.
    </Alert>}
    {error && <Alert tone="danger">{error}</Alert>}
    <Card title="Próxima atividade do ciclo">
      {next ? <div className="space-y-4">
        <div className="flex items-center gap-2 font-semibold"><DisciplineDot color={next.discipline.color} />{next.discipline.name}</div>
        <p className="text-sm text-fg">{next.topic?.title ?? 'Sem assunto disponível no edital'}</p>
        <p className="text-xs text-fg-muted">{next.reason}</p>
        <Field label="Duração da sessão (minutos)"><Input type="number" min={1} max={720} value={minutes} placeholder={String(next.minutes)} onChange={e => setMinutes(e.target.value)} /></Field>
        {timer ? <Link className="text-primary underline" to="/estudar-agora">Retomar sessão em andamento</Link>
          : <Button onClick={() => void start()} loading={loading}>Iniciar estudo do ciclo</Button>}
        <p className="text-xs text-fg-muted">{cycleCompletions(sessions).length} sessões concluídas no ciclo. Continue de onde parou, sem datas obrigatórias.</p>
      </div> : <p className="text-sm text-fg-muted">Cadastre ou ative uma disciplina para começar.</p>}
    </Card>
    {showQueue && <details className="rounded-xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold">Pesos das disciplinas</summary>
      <p className="mt-2 text-xs text-fg-muted">Pesos maiores aumentam a frequência. O ciclo também considera desempenho e erros. Reordene as disciplinas na tela Disciplinas.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{disciplines.filter(d => d.active).map(d => <Field key={`${d.id}:${settings.distribution[d.id]}`} label={d.name}>
        <Input type="number" min={0} max={10080} defaultValue={settings.distribution[d.id] ?? 1} onBlur={e => {
          const weight = Number(e.target.value);
          void updateSettings({ distribution: { ...settings.distribution, [d.id]: weight } }).catch(err => setError(errorMessage(err)));
        }} />
      </Field>)}</div>
    </details>}
    {showQueue && queue.length > 0 && <Card title="Próximas disciplinas" description="Prévia adaptativa: atualizada conforme suas sessões, questões e erros.">
      <ol className="space-y-3">{queue.slice(1).map((activity, index) => <li key={index} className="text-sm flex items-start gap-2">
        <DisciplineDot color={activity.discipline.color} /><div>{activity.discipline.name}<p className="text-xs text-fg-muted">{activity.topic?.title ?? 'Sem assunto disponível'}</p></div>
      </li>)}</ol>
    </Card>}
  </div>;
}
