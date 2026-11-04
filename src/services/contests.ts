import { db, ensureSeed } from '../db/db';
import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS, DEFAULT_TOPICS } from '../db/seed';
import { SETTINGS_ID, type Discipline, type Settings, type Topic } from '../db/types';
import {
  buildContestDefaultSyllabus,
  getContestCatalogItem,
  parseEditalVerticalizado,
  type ContestCatalogItem,
} from '../domain/contests';
import { startOfWeek, todayKey } from '../lib/dates';
import { createId } from '../lib/utils';
import { buildBuiltinAiSchedule } from './aiSchedule';
import {
  getActiveContestScopeId,
  getAuthSession,
  replaceUserWorkspaceInApi,
  setActiveContestScopeId,
  waitForPendingSync,
} from './auth';

export { getActiveContestScopeId, setActiveContestScopeId };

export interface UserContestProfile {
  /** ID do escopo do concurso ('default' para o primeiro concurso da conta ou 'contest_xxx' para novos). */
  id: string;
  /** ID do template no catálogo (ex: 'bnb-ti', 'bb-ti', 'pf-agente', 'custom'). */
  templateId: string;
  /** Nome principal do concurso (ex: 'Banco do Brasil', 'Polícia Federal'). */
  name: string;
  /** Sigla ou abreviação para avatar/card (ex: 'BB', 'PF', 'BNB'). */
  shortName: string;
  /** Cargo ou área escolhida (ex: 'Agente de Tecnologia'). */
  role: string;
  /** Categoria do concurso. */
  category: string;
  /** Banca examinadora (ex: 'Cesgranrio', 'Cebraspe'). */
  examBoard: string;
  /** Cor de destaque para o card estilo Netflix. */
  accentColor: string;
  /** Nome do arquivo de edital verticalizado enviado (se houver). */
  editalFileName: string | null;
  /** Quantidade de disciplinas configuradas. */
  disciplineCount: number;
  /** Quantidade de tópicos do edital verticalizado. */
  topicCount: number;
  /** Data de criação (ISO). */
  createdAt: string;
  /** Último acesso (ISO). */
  lastAccessedAt: string;
}

export interface CreateContestInput {
  templateId: string;
  customName?: string;
  customRole?: string;
  customExamBoard?: string;
  editalText?: string;
  editalFileName?: string | null;
  examDate?: string | null;
  weeklyGoalMinutes?: number;
  generateScheduleNow?: boolean;
}

const CONTEST_LIST_KEY_PREFIX = 'estudae_user_contests_v1:';

type ContestListener = () => void;
const listeners = new Set<ContestListener>();

function notifyContestListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeContests(listener: ContestListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStorageKeyForCurrentUser(): string {
  const email = getAuthSession()?.user?.email?.toLowerCase() || 'guest';
  return `${CONTEST_LIST_KEY_PREFIX}${email}`;
}

function computeShortName(name: string, fallback?: string): string {
  if (fallback && fallback.trim().length <= 6) return fallback.trim().toUpperCase();
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z0-9]+$/.test(w));
  if (words.length === 1) {
    return words[0].slice(0, 4).toUpperCase();
  }
  const acronym = words
    .slice(0, 4)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return acronym || name.slice(0, 3).toUpperCase();
}

export function getUserContests(): UserContestProfile[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [buildDefaultContestProfileFromMemory()];
  }
  try {
    const raw = window.localStorage.getItem(getStorageKeyForCurrentUser());
    if (!raw) {
      const initial = [buildDefaultContestProfileFromMemory()];
      saveUserContests(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as UserContestProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const initial = [buildDefaultContestProfileFromMemory()];
      saveUserContests(initial);
      return initial;
    }
    return parsed;
  } catch {
    return [buildDefaultContestProfileFromMemory()];
  }
}

export function saveUserContests(contests: UserContestProfile[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getStorageKeyForCurrentUser(), JSON.stringify(contests));
  } catch {
    // Ignore storage errors
  }
  notifyContestListeners();
}

function buildDefaultContestProfileFromMemory(): UserContestProfile {
  const settings = db.settings.toArraySync()[0] as Settings | undefined;
  const disciplines = db.disciplines.toArraySync();
  const topics = db.topics.toArraySync();
  const templateId = settings?.contestId || 'bnb-ti';
  const tpl = getContestCatalogItem(templateId);
  const name = settings?.contestName || tpl?.name || 'Banco do Nordeste (BNB)';
  const role = settings?.contestRole || tpl?.role || 'Analista de Sistemas';

  return {
    id: 'default',
    templateId,
    name,
    shortName: computeShortName(name, tpl?.sigla),
    role,
    category: tpl?.category || 'Bancários',
    examBoard: tpl?.banca || 'Cesgranrio',
    accentColor: tpl?.color || '#c20018',
    editalFileName: settings?.editalFileName ?? null,
    disciplineCount: disciplines.length || 8,
    topicCount: topics.length || 148,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
  };
}

/**
 * Sincroniza os metadados do card do concurso ativo com os dados reais carregados no workspace.
 */
export function syncActiveContestMetadataFromDb(): void {
  const activeId = getActiveContestScopeId();
  const list = getUserContests();
  const settings = db.settings.toArraySync()[0] as Settings | undefined;
  const disciplines = db.disciplines.toArraySync();
  const topics = db.topics.toArraySync();

  const idx = list.findIndex((c) => c.id === activeId);
  if (idx >= 0) {
    const current = list[idx];
    const updated: UserContestProfile = {
      ...current,
      name: settings?.contestName || current.name,
      role: settings?.contestRole || current.role,
      editalFileName: settings?.editalFileName ?? current.editalFileName,
      disciplineCount: disciplines.length || current.disciplineCount,
      topicCount: topics.length,
      lastAccessedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    saveUserContests(list);
  }
}

export function getActiveContestProfile(): UserContestProfile {
  const activeId = getActiveContestScopeId();
  const list = getUserContests();
  return list.find((c) => c.id === activeId) ?? list[0] ?? buildDefaultContestProfileFromMemory();
}

/**
 * Alterna o concurso ativo, carrega o workspace isolado daquele concurso e notifica a UI.
 */
export async function switchActiveContest(contestId: string): Promise<UserContestProfile> {
  await waitForPendingSync();
  db.persistLocalWorkspaceCache();

  setActiveContestScopeId(contestId);

  const list = getUserContests();
  const idx = list.findIndex((c) => c.id === contestId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], lastAccessedAt: new Date().toISOString() };
    saveUserContests(list);
  }

  // Limpa memória atual antes de hidratar o concurso selecionado
  db.clearMemory();
  await ensureSeed(db);
  syncActiveContestMetadataFromDb();
  notifyContestListeners();

  return getActiveContestProfile();
}

/**
 * Inicializa ou cria um concurso (no momento do cadastro ou pelo botão "+ Novo concurso"),
 * adaptando disciplinas, tópicos do Edital Verticalizado e gerando o cronograma de 24 semanas.
 */
export async function createAndActivateContest(
  input: CreateContestInput,
  options: { isInitialRegistration?: boolean } = {},
): Promise<UserContestProfile> {
  await waitForPendingSync();
  if (!options.isInitialRegistration) {
    db.persistLocalWorkspaceCache();
  }

  const tpl: ContestCatalogItem | undefined = getContestCatalogItem(input.templateId);
  const contestName =
    (input.customName?.trim() || tpl?.name || 'Concurso Público').trim();
  const contestRole =
    (input.customRole?.trim() || tpl?.role || 'Cargo Geral').trim();
  const examBoard =
    (input.customExamBoard?.trim() || tpl?.banca || 'Banca Examinadora').trim();
  const category = tpl?.category || 'Personalizado';
  const accentColor = tpl?.color || '#c20018';
  const weeklyGoalMinutes = input.weeklyGoalMinutes ?? DEFAULT_SETTINGS.weeklyGoalMinutes;

  let disciplines: Discipline[];
  let topics: Topic[];
  let distribution: Record<string, number>;

  if (input.editalText && input.editalText.trim().length > 0) {
    const parsed = parseEditalVerticalizado(input.editalText, input.templateId);
    disciplines = parsed.disciplines;
    topics = parsed.topics;
    distribution = parsed.distribution;
  } else if (input.templateId === 'bnb-ti') {
    disciplines = DEFAULT_DISCIPLINES.map((d) => ({ ...d }));
    topics = DEFAULT_TOPICS.map((t) => ({ ...t }));
    distribution = { ...DEFAULT_SETTINGS.distribution };
  } else if (tpl) {
    const built = buildContestDefaultSyllabus(tpl.id);
    disciplines = built.disciplines;
    topics = built.topics;
    distribution = built.distribution;
  } else {
    disciplines = DEFAULT_DISCIPLINES.map((d) => ({ ...d }));
    topics = DEFAULT_TOPICS.map((t) => ({ ...t }));
    distribution = { ...DEFAULT_SETTINGS.distribution };
  }

  const existingContests = getUserContests();
  const contestScopeId = options.isInitialRegistration
    ? 'default'
    : `contest_${createId().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16)}`;

  setActiveContestScopeId(contestScopeId);

  const startMonday = startOfWeek(todayKey());
  const newSettings: Settings = {
    ...DEFAULT_SETTINGS,
    id: SETTINGS_ID,
    weeklyGoalMinutes,
    dailyGoalMinutes: Math.max(30, Math.round(weeklyGoalMinutes / 7)),
    examDate: input.examDate ?? null,
    scheduleStartDate: input.generateScheduleNow !== false ? startMonday : null,
    scheduleWeeks: 24,
    distribution,
    contestId: input.templateId,
    contestName,
    contestRole,
    editalFileName: input.editalFileName ?? null,
  };

  let sessions = [] as ReturnType<typeof buildBuiltinAiSchedule>['sessions'];
  let weeklyPlans = [] as ReturnType<typeof buildBuiltinAiSchedule>['weeklyPlans'];

  if (input.generateScheduleNow !== false) {
    const generated = buildBuiltinAiSchedule(
      startMonday,
      disciplines,
      topics,
      undefined,
      `${contestName} — ${contestRole}`,
    );
    sessions = generated.sessions;
    weeklyPlans = generated.weeklyPlans;
  }

  const workspacePayload = {
    disciplines,
    topics,
    sessions,
    timer: [],
    questionLogs: [],
    errorNotes: [],
    reviews: [],
    weeklyPlans,
    settings: [newSettings],
    mockExams: [],
  };

  db.replaceAllFromBackup(workspacePayload);
  db.persistLocalWorkspaceCache();
  await replaceUserWorkspaceInApi(db.exportWorkspaceSnapshot());
  await waitForPendingSync();

  const newProfile: UserContestProfile = {
    id: contestScopeId,
    templateId: input.templateId,
    name: contestName,
    shortName: computeShortName(contestName, tpl?.sigla),
    role: contestRole,
    category,
    examBoard,
    accentColor,
    editalFileName: input.editalFileName ?? null,
    disciplineCount: disciplines.length,
    topicCount: topics.length,
    createdAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
  };

  const updatedList = options.isInitialRegistration
    ? [newProfile]
    : [...existingContests.filter((c) => c.id !== contestScopeId), newProfile];

  saveUserContests(updatedList);
  notifyContestListeners();
  return newProfile;
}

/**
 * Exclui um concurso da conta do usuário (mantendo ao menos 1 concurso ativo).
 */
export async function deleteContestProfile(contestId: string): Promise<void> {
  const list = getUserContests();
  if (list.length <= 1) {
    throw new Error('Sua conta precisa manter pelo menos um concurso ativo.');
  }
  const filtered = list.filter((c) => c.id !== contestId);
  saveUserContests(filtered);

  const session = getAuthSession();
  if (session?.user?.email && typeof window !== 'undefined' && window.localStorage) {
    const key =
      contestId === 'default'
        ? `bnb_workspace_cache_v1:${session.user.email.toLowerCase()}`
        : `bnb_workspace_cache_v1:${session.user.email.toLowerCase()}::${contestId}`;
    window.localStorage.removeItem(key);
  }

  if (getActiveContestScopeId() === contestId) {
    await switchActiveContest(filtered[0].id);
  } else {
    notifyContestListeners();
  }
}
