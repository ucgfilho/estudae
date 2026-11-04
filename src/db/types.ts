import type { DateKey } from '../lib/dates';

/**
 * Modelo de dados da aplicação sincronizado com o banco de dados na nuvem (MongoDB).
 * Baseado no modelo sugerido na especificação, com ajustes documentados:
 * - `order` em disciplinas/tópicos para reorganização;
 * - `kind` em disciplinas para separar técnicas/gerais na distribuição;
 * - `objective`, `origin`, `history` e `recoveredFromId` em sessões para
 *   reagendamento/recuperação sem perda do histórico de execução;
 * - `weekIndex`/`plannedContent` no plano semanal do cronograma de 24 semanas.
 */

export type DisciplineKind = 'technical' | 'general';

export interface Discipline {
  id: string;
  name: string;
  color: string;
  active: boolean;
  order: number;
  kind: DisciplineKind;
}

export type TopicStatus = 'nao-iniciado' | 'em-andamento' | 'concluido' | 'dominado';

export const TOPIC_STATUS_LABELS: Record<TopicStatus, string> = {
  'nao-iniciado': 'Não iniciado',
  'em-andamento': 'Em andamento',
  concluido: 'Concluído',
  dominado: 'Dominado',
};

export interface Topic {
  id: string;
  disciplineId: string;
  title: string;
  parentTopicId: string | null;
  status: TopicStatus;
  notes: string;
  order: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus = 'planejada' | 'concluida' | 'perdida';

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  planejada: 'Planejada',
  concluida: 'Concluída',
  perdida: 'Perdida',
};

export type SessionOrigin = 'planejada' | 'avulsa';

export interface SessionHistoryEntry {
  at: string;
  type: 'criada' | 'reagendada' | 'status' | 'executada' | 'recuperada' | 'editada';
  description: string;
}

export interface StudySession {
  id: string;
  /** Data planejada (ou data de execução para sessões avulsas). */
  date: DateKey;
  disciplineId: string;
  topicId: string | null;
  /** Horário previsto HH:mm, opcional. */
  plannedStart: string | null;
  plannedMinutes: number;
  /** Tempo efetivamente estudado (segundos). */
  actualSeconds: number;
  status: SessionStatus;
  objective: string;
  notes: string;
  origin: SessionOrigin;
  /** Instante de início da última execução (ISO). */
  startedAt: string | null;
  /** Instante de término da última execução (ISO). */
  endedAt: string | null;
  /** Sessão original quando esta foi criada por recuperação/reagendamento. */
  recoveredFromId: string | null;
  /** Identifica se a sessão foi criada/planejada manualmente pelo usuário ou via cronograma gerado */
  isManual?: boolean;
  /** Ordem de exibição da sessão dentro do mesmo dia. */
  order?: number;
  history: SessionHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export type TimerStatus = 'running' | 'paused';

export const ACTIVE_TIMER_ID = 'active';

export interface TimerState {
  id: typeof ACTIVE_TIMER_ID;
  /** Sessão planejada vinculada; `null` para sessão avulsa. */
  sessionId: string | null;
  status: TimerStatus;
  /** Instante (epoch ms) de início do trecho em execução; `null` se pausado. */
  startedAt: number | null;
  /** Instante (epoch ms) do primeiro início. */
  firstStartedAt: number;
  accumulatedSeconds: number;
  plannedSeconds: number;
  disciplineId: string;
  topicId: string | null;
  objective: string;
  notes: string;
  updatedAt: number;
}

export interface QuestionLog {
  id: string;
  date: DateKey;
  disciplineId: string;
  topicId: string | null;
  source: string;
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  durationMinutes: number | null;
  notes: string;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ErrorType = 'falta-conteudo' | 'interpretacao' | 'desatencao' | 'confusao-alternativas' | 'outro';

export const ERROR_TYPE_LABELS: Record<ErrorType, string> = {
  'falta-conteudo': 'Falta de conteúdo',
  interpretacao: 'Interpretação',
  desatencao: 'Desatenção',
  'confusao-alternativas': 'Confusão entre alternativas',
  outro: 'Outro',
};

export type ErrorStatus = 'revisar' | 'revisado' | 'dominado';

export const ERROR_STATUS_LABELS: Record<ErrorStatus, string> = {
  revisar: 'Revisar',
  revisado: 'Revisado',
  dominado: 'Dominado',
};

export interface ErrorNote {
  id: string;
  questionLogId: string | null;
  disciplineId: string;
  topicId: string | null;
  sourceReference: string;
  errorType: ErrorType;
  explanation: string;
  errorDate: DateKey;
  status: ErrorStatus;
  nextReviewDate: DateKey | null;
  createdAt: string;
  updatedAt: string;
}

export type ReviewStatus = 'pendente' | 'concluida';

export interface ReviewTask {
  id: string;
  disciplineId: string;
  topicId: string | null;
  errorNoteId: string | null;
  title: string;
  dueDate: DateKey;
  intervalDays: number;
  status: ReviewStatus;
  completedAt: string | null;
  createdAt: string;
}

export type WeeklyPlanStatus = 'pendente' | 'em-andamento' | 'concluida';

export const WEEKLY_PLAN_STATUS_LABELS: Record<WeeklyPlanStatus, string> = {
  pendente: 'Pendente',
  'em-andamento': 'Em andamento',
  concluida: 'Concluída',
};

export interface WeeklyPlan {
  id: string;
  weekIndex: number;
  weekStart: DateKey;
  objectives: string;
  plannedContent: string;
  plannedMinutes: number;
  status: WeeklyPlanStatus;
  notes: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export const SETTINGS_ID = 'settings';

export interface Settings {
  id: typeof SETTINGS_ID;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  /** Meta diária de questões definida pelo usuário (`null` = não definida). */
  dailyQuestionGoal: number | null;
  accuracyGoal: number;
  /** Meta de conclusão de tópicos em % (`null` = não definida). */
  topicCompletionGoal: number | null;
  reviewIntervals: number[];
  theme: ThemePreference;
  examDate: DateKey | null;
  /** Início do cronograma de 24 semanas (`null` = ainda não gerado). */
  scheduleStartDate: DateKey | null;
  scheduleWeeks: number;
  /** Minutos semanais planejados por disciplina. */
  distribution: Record<string, number>;
  /** Chave de API do Google Gemini para geração de cronograma via IA. */
  geminiApiKey?: string;
  /** Provedor preferido de IA ('builtin' | 'gemini'). */
  aiProvider?: 'builtin' | 'gemini';
  /** Identificador do concurso ativo neste workspace. */
  contestId?: string;
  /** Nome do concurso escolhido pelo usuário (ex: "Banco do Brasil", "Polícia Federal"). */
  contestName?: string;
  /** Cargo/área escolhida pelo usuário (ex: "Agente de Tecnologia"). */
  contestRole?: string;
  /** Nome do arquivo de edital verticalizado enviado pelo usuário. */
  editalFileName?: string | null;
}

/**
 * Simulado: gabarito, faixas por disciplina e respostas marcadas.
 * Chaves de `answerKey`/`responses` são o número da questão em texto
 * (limitação do JSON/IndexedDB para chaves numéricas em backups).
 */
export interface MockExamRange {
  from: number;
  to: number;
  disciplineId: string;
}

export interface MockExam {
  id: string;
  title: string;
  examFileName: string | null;
  keyFileName: string | null;
  questionCount: number;
  optionCount: number;
  answerKey: Record<string, string>;
  ranges: MockExamRange[];
  responses: Record<string, string | null>;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tabelas incluídas em backup, sincronização e restauração. */
export const DATA_TABLES = [
  'disciplines',
  'topics',
  'sessions',
  'timer',
  'questionLogs',
  'errorNotes',
  'reviews',
  'weeklyPlans',
  'settings',
  'mockExams',
] as const;

export type DataTableName = (typeof DATA_TABLES)[number];
