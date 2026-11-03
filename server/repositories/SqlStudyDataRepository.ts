import { DEFAULT_DISCIPLINES, DEFAULT_SETTINGS } from '../../src/db/seed';
import {
  ACTIVE_TIMER_ID,
  DATA_TABLES,
  SETTINGS_ID,
  type DataTableName,
  type Discipline,
  type ErrorNote,
  type MockExam,
  type QuestionLog,
  type ReviewTask,
  type SessionHistoryEntry,
  type Settings,
  type StudySession,
  type TimerState,
  type Topic,
  type WeeklyPlan,
} from '../../src/db/types';
import {
  validateTableRecords,
  type StudyWorkspaceDto,
  type TableMutationOperationDto,
} from '../dtos/study-data.dto';
import type { IDatabaseClient } from '../interfaces/IDatabaseClient';
import type { ISensitiveDataCipher } from '../interfaces/ISensitiveDataCipher';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';

/**
 * Implementação concreta de IStudyDataRepository (SRP, LSP & DIP).
 * Todos os registros de estudo são intrinsecamente vinculados ao `user_id` do usuário autenticado.
 * Credenciais sensíveis de terceiros (gemini_api_key) são criptografadas em repouso (AES-256-GCM / LGPD Art. 46).
 */
export class SqlStudyDataRepository implements IStudyDataRepository {
  private readonly db: IDatabaseClient;
  private readonly cipher?: ISensitiveDataCipher;

  constructor(db: IDatabaseClient, cipher?: ISensitiveDataCipher) {
    this.db = db;
    this.cipher = cipher;
  }

  public ensureUserSeed(userId: string): void {
    this.db.transaction(() => {
      const existingDiscs = this.db.all<{ id: string }>(
        `SELECT id FROM disciplines WHERE user_id = ?`,
        [userId],
      );
      const existingSet = new Set(existingDiscs.map((d) => d.id));
      const missing = DEFAULT_DISCIPLINES.filter((d) => !existingSet.has(d.id));
      if (missing.length > 0) {
        this.upsertDisciplines(userId, missing);
      }

      const settingsRow = this.db.get<{ user_id: string }>(
        `SELECT user_id FROM user_settings WHERE user_id = ?`,
        [userId],
      );
      if (!settingsRow) {
        this.upsertSettings(userId, [
          {
            ...DEFAULT_SETTINGS,
            distribution: { ...DEFAULT_SETTINGS.distribution },
          },
        ]);
      }
    });
  }

  public getWorkspace(userId: string): StudyWorkspaceDto {
    this.ensureUserSeed(userId);
    return {
      disciplines: this.getDisciplines(userId),
      topics: this.getTopics(userId),
      sessions: this.getSessions(userId),
      timer: this.getTimers(userId),
      questionLogs: this.getQuestionLogs(userId),
      errorNotes: this.getErrorNotes(userId),
      reviews: this.getReviews(userId),
      weeklyPlans: this.getWeeklyPlans(userId),
      settings: this.getSettingsList(userId),
      mockExams: this.getMockExams(userId),
    };
  }

  public replaceWorkspace(userId: string, workspace: StudyWorkspaceDto): StudyWorkspaceDto {
    this.db.transaction(() => {
      for (const table of DATA_TABLES) {
        this.clearTableInternal(userId, table);
      }
      this.upsertDisciplines(userId, workspace.disciplines);
      this.upsertTopics(userId, workspace.topics);
      this.upsertSessions(userId, workspace.sessions);
      this.upsertTimers(userId, workspace.timer);
      this.upsertQuestionLogs(userId, workspace.questionLogs);
      this.upsertErrorNotes(userId, workspace.errorNotes);
      this.upsertReviews(userId, workspace.reviews);
      this.upsertWeeklyPlans(userId, workspace.weeklyPlans);
      this.upsertSettings(userId, workspace.settings);
      this.upsertMockExams(userId, workspace.mockExams);
      this.ensureUserSeed(userId);
    });
    return this.getWorkspace(userId);
  }

  public resetWorkspace(userId: string): StudyWorkspaceDto {
    this.db.transaction(() => {
      for (const table of DATA_TABLES) {
        this.clearTableInternal(userId, table);
      }
      this.ensureUserSeed(userId);
    });
    return this.getWorkspace(userId);
  }

  public deleteUserWorkspace(userId: string): void {
    this.db.transaction(() => {
      for (const table of DATA_TABLES) {
        this.clearTableInternal(userId, table);
      }
    });
  }

  public applyBatch(userId: string, operations: readonly TableMutationOperationDto[]): void {
    this.db.transaction(() => {
      for (const op of operations) {
        if (op.action === 'clear') {
          this.clearTableInternal(userId, op.table);
        } else if (op.action === 'delete') {
          this.deleteFromTableInternal(userId, op.table, op.ids);
        } else if (op.action === 'upsert') {
          const validated = validateTableRecords(op.table, op.records);
          this.upsertTableInternal(userId, op.table, validated);
        }
      }
    });
  }

  public upsertTable(userId: string, table: DataTableName, records: readonly unknown[]): void {
    const validated = validateTableRecords(table, records);
    this.db.transaction(() => {
      this.upsertTableInternal(userId, table, validated);
    });
  }

  public deleteFromTable(userId: string, table: DataTableName, ids: readonly string[]): void {
    this.db.transaction(() => {
      this.deleteFromTableInternal(userId, table, ids);
    });
  }

  public clearTable(userId: string, table: DataTableName): void {
    this.db.transaction(() => {
      this.clearTableInternal(userId, table);
    });
  }

  /* ----------------------- Métodos Internos de Escrita ----------------------- */

  private upsertTableInternal(userId: string, table: DataTableName, records: readonly unknown[]): void {
    if (records.length === 0) return;
    switch (table) {
      case 'disciplines':
        this.upsertDisciplines(userId, records as Discipline[]);
        break;
      case 'topics':
        this.upsertTopics(userId, records as Topic[]);
        break;
      case 'sessions':
        this.upsertSessions(userId, records as StudySession[]);
        break;
      case 'timer':
        this.upsertTimers(userId, records as TimerState[]);
        break;
      case 'questionLogs':
        this.upsertQuestionLogs(userId, records as QuestionLog[]);
        break;
      case 'errorNotes':
        this.upsertErrorNotes(userId, records as ErrorNote[]);
        break;
      case 'reviews':
        this.upsertReviews(userId, records as ReviewTask[]);
        break;
      case 'weeklyPlans':
        this.upsertWeeklyPlans(userId, records as WeeklyPlan[]);
        break;
      case 'settings':
        this.upsertSettings(userId, records as Settings[]);
        break;
      case 'mockExams':
        this.upsertMockExams(userId, records as MockExam[]);
        break;
    }
  }

  private deleteFromTableInternal(userId: string, table: DataTableName, ids: readonly string[]): void {
    if (ids.length === 0) return;
    const sqlTable = this.mapSqlTableName(table);
    for (const id of ids) {
      this.db.run(`DELETE FROM ${sqlTable} WHERE user_id = ? AND id = ?`, [userId, id]);
    }
  }

  private clearTableInternal(userId: string, table: DataTableName): void {
    const sqlTable = this.mapSqlTableName(table);
    this.db.run(`DELETE FROM ${sqlTable} WHERE user_id = ?`, [userId]);
  }

  private mapSqlTableName(table: DataTableName): string {
    switch (table) {
      case 'disciplines':
        return 'disciplines';
      case 'topics':
        return 'topics';
      case 'sessions':
        return 'study_sessions';
      case 'timer':
        return 'timer_states';
      case 'questionLogs':
        return 'question_logs';
      case 'errorNotes':
        return 'error_notes';
      case 'reviews':
        return 'review_tasks';
      case 'weeklyPlans':
        return 'weekly_plans';
      case 'settings':
        return 'user_settings';
      case 'mockExams':
        return 'mock_exams';
    }
  }

  private upsertDisciplines(userId: string, items: readonly Discipline[]): void {
    for (const d of items) {
      this.db.run(
        `INSERT INTO disciplines (user_id, id, name, color, active, sort_order, kind)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           name = excluded.name,
           color = excluded.color,
           active = excluded.active,
           sort_order = excluded.sort_order,
           kind = excluded.kind`,
        [userId, d.id, d.name, d.color, d.active ? 1 : 0, d.order, d.kind],
      );
    }
  }

  private upsertTopics(userId: string, items: readonly Topic[]): void {
    for (const t of items) {
      this.db.run(
        `INSERT INTO topics (user_id, id, discipline_id, title, parent_topic_id, status, notes, sort_order, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           discipline_id = excluded.discipline_id,
           title = excluded.title,
           parent_topic_id = excluded.parent_topic_id,
           status = excluded.status,
           notes = excluded.notes,
           sort_order = excluded.sort_order,
           active = excluded.active,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          userId,
          t.id,
          t.disciplineId,
          t.title,
          t.parentTopicId,
          t.status,
          t.notes,
          t.order,
          t.active ? 1 : 0,
          t.createdAt,
          t.updatedAt,
        ],
      );
    }
  }

  private upsertSessions(userId: string, items: readonly StudySession[]): void {
    for (const s of items) {
      this.db.run(
        `INSERT INTO study_sessions (
           user_id, id, date, discipline_id, topic_id, planned_start, planned_minutes,
           actual_seconds, status, objective, notes, origin, started_at, ended_at,
           recovered_from_id, is_manual, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           date = excluded.date,
           discipline_id = excluded.discipline_id,
           topic_id = excluded.topic_id,
           planned_start = excluded.planned_start,
           planned_minutes = excluded.planned_minutes,
           actual_seconds = excluded.actual_seconds,
           status = excluded.status,
           objective = excluded.objective,
           notes = excluded.notes,
           origin = excluded.origin,
           started_at = excluded.started_at,
           ended_at = excluded.ended_at,
           recovered_from_id = excluded.recovered_from_id,
           is_manual = excluded.is_manual,
           sort_order = excluded.sort_order,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          userId,
          s.id,
          s.date,
          s.disciplineId,
          s.topicId,
          s.plannedStart,
          s.plannedMinutes,
          s.actualSeconds,
          s.status,
          s.objective,
          s.notes,
          s.origin,
          s.startedAt,
          s.endedAt,
          s.recoveredFromId,
          s.isManual === undefined ? null : s.isManual ? 1 : 0,
          s.order ?? null,
          s.createdAt,
          s.updatedAt,
        ],
      );

      this.db.run(
        `DELETE FROM study_session_history WHERE user_id = ? AND session_id = ?`,
        [userId, s.id],
      );
      s.history.forEach((h, seq) => {
        this.db.run(
          `INSERT INTO study_session_history (user_id, session_id, seq, occurred_at, entry_type, description)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, s.id, seq, h.at, h.type, h.description],
        );
      });
    }
  }

  private upsertTimers(userId: string, items: readonly TimerState[]): void {
    for (const t of items) {
      this.db.run(
        `INSERT INTO timer_states (
           user_id, id, session_id, status, started_at, first_started_at,
           accumulated_seconds, planned_seconds, discipline_id, topic_id,
           objective, notes, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           session_id = excluded.session_id,
           status = excluded.status,
           started_at = excluded.started_at,
           first_started_at = excluded.first_started_at,
           accumulated_seconds = excluded.accumulated_seconds,
           planned_seconds = excluded.planned_seconds,
           discipline_id = excluded.discipline_id,
           topic_id = excluded.topic_id,
           objective = excluded.objective,
           notes = excluded.notes,
           updated_at = excluded.updated_at`,
        [
          userId,
          t.id,
          t.sessionId,
          t.status,
          t.startedAt,
          t.firstStartedAt,
          t.accumulatedSeconds,
          t.plannedSeconds,
          t.disciplineId,
          t.topicId,
          t.objective,
          t.notes,
          t.updatedAt,
        ],
      );
    }
  }

  private upsertQuestionLogs(userId: string, items: readonly QuestionLog[]): void {
    for (const q of items) {
      this.db.run(
        `INSERT INTO question_logs (
           user_id, id, date, discipline_id, topic_id, source,
           total, correct, incorrect, blank, duration_minutes,
           notes, session_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           date = excluded.date,
           discipline_id = excluded.discipline_id,
           topic_id = excluded.topic_id,
           source = excluded.source,
           total = excluded.total,
           correct = excluded.correct,
           incorrect = excluded.incorrect,
           blank = excluded.blank,
           duration_minutes = excluded.duration_minutes,
           notes = excluded.notes,
           session_id = excluded.session_id,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          userId,
          q.id,
          q.date,
          q.disciplineId,
          q.topicId,
          q.source,
          q.total,
          q.correct,
          q.incorrect,
          q.blank,
          q.durationMinutes,
          q.notes,
          q.sessionId,
          q.createdAt,
          q.updatedAt,
        ],
      );
    }
  }

  private upsertErrorNotes(userId: string, items: readonly ErrorNote[]): void {
    for (const e of items) {
      this.db.run(
        `INSERT INTO error_notes (
           user_id, id, question_log_id, discipline_id, topic_id,
           source_reference, error_type, explanation, error_date,
           status, next_review_date, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           question_log_id = excluded.question_log_id,
           discipline_id = excluded.discipline_id,
           topic_id = excluded.topic_id,
           source_reference = excluded.source_reference,
           error_type = excluded.error_type,
           explanation = excluded.explanation,
           error_date = excluded.error_date,
           status = excluded.status,
           next_review_date = excluded.next_review_date,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          userId,
          e.id,
          e.questionLogId,
          e.disciplineId,
          e.topicId,
          e.sourceReference,
          e.errorType,
          e.explanation,
          e.errorDate,
          e.status,
          e.nextReviewDate,
          e.createdAt,
          e.updatedAt,
        ],
      );
    }
  }

  private upsertReviews(userId: string, items: readonly ReviewTask[]): void {
    for (const r of items) {
      this.db.run(
        `INSERT INTO review_tasks (
           user_id, id, discipline_id, topic_id, error_note_id,
           title, due_date, interval_days, status, completed_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           discipline_id = excluded.discipline_id,
           topic_id = excluded.topic_id,
           error_note_id = excluded.error_note_id,
           title = excluded.title,
           due_date = excluded.due_date,
           interval_days = excluded.interval_days,
           status = excluded.status,
           completed_at = excluded.completed_at,
           created_at = excluded.created_at`,
        [
          userId,
          r.id,
          r.disciplineId,
          r.topicId,
          r.errorNoteId,
          r.title,
          r.dueDate,
          r.intervalDays,
          r.status,
          r.completedAt,
          r.createdAt,
        ],
      );
    }
  }

  private upsertWeeklyPlans(userId: string, items: readonly WeeklyPlan[]): void {
    for (const w of items) {
      // Remove eventual conflito de week_index para o mesmo usuário antes do upsert
      this.db.run(
        `DELETE FROM weekly_plans WHERE user_id = ? AND week_index = ? AND id != ?`,
        [userId, w.weekIndex, w.id],
      );
      this.db.run(
        `INSERT INTO weekly_plans (
           user_id, id, week_index, week_start, objectives,
           planned_content, planned_minutes, status, notes
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           week_index = excluded.week_index,
           week_start = excluded.week_start,
           objectives = excluded.objectives,
           planned_content = excluded.planned_content,
           planned_minutes = excluded.planned_minutes,
           status = excluded.status,
           notes = excluded.notes`,
        [
          userId,
          w.id,
          w.weekIndex,
          w.weekStart,
          w.objectives,
          w.plannedContent,
          w.plannedMinutes,
          w.status,
          w.notes,
        ],
      );
    }
  }

  private upsertSettings(userId: string, items: readonly Settings[]): void {
    for (const s of items) {
      this.db.run(
        `INSERT INTO user_settings (
           user_id, id, daily_goal_minutes, weekly_goal_minutes,
           daily_question_goal, accuracy_goal, topic_completion_goal,
           review_intervals_json, theme, exam_date, schedule_start_date,
           schedule_weeks, distribution_json, gemini_api_key, ai_provider
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           id = excluded.id,
           daily_goal_minutes = excluded.daily_goal_minutes,
           weekly_goal_minutes = excluded.weekly_goal_minutes,
           daily_question_goal = excluded.daily_question_goal,
           accuracy_goal = excluded.accuracy_goal,
           topic_completion_goal = excluded.topic_completion_goal,
           review_intervals_json = excluded.review_intervals_json,
           theme = excluded.theme,
           exam_date = excluded.exam_date,
           schedule_start_date = excluded.schedule_start_date,
           schedule_weeks = excluded.schedule_weeks,
           distribution_json = excluded.distribution_json,
           gemini_api_key = excluded.gemini_api_key,
           ai_provider = excluded.ai_provider`,
        [
          userId,
          SETTINGS_ID,
          s.dailyGoalMinutes,
          s.weeklyGoalMinutes,
          s.dailyQuestionGoal,
          s.accuracyGoal,
          s.topicCompletionGoal,
          JSON.stringify(s.reviewIntervals),
          s.theme,
          s.examDate,
          s.scheduleStartDate,
          s.scheduleWeeks,
          JSON.stringify(s.distribution),
          this.cipher ? this.cipher.encrypt(s.geminiApiKey ?? '') : (s.geminiApiKey ?? ''),
          s.aiProvider ?? 'builtin',
        ],
      );
    }
  }

  private upsertMockExams(userId: string, items: readonly MockExam[]): void {
    for (const m of items) {
      this.db.run(
        `INSERT INTO mock_exams (
           user_id, id, title, exam_file_name, key_file_name,
           question_count, option_count, answer_key_json,
           ranges_json, responses_json, submitted_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, id) DO UPDATE SET
           title = excluded.title,
           exam_file_name = excluded.exam_file_name,
           key_file_name = excluded.key_file_name,
           question_count = excluded.question_count,
           option_count = excluded.option_count,
           answer_key_json = excluded.answer_key_json,
           ranges_json = excluded.ranges_json,
           responses_json = excluded.responses_json,
           submitted_at = excluded.submitted_at,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at`,
        [
          userId,
          m.id,
          m.title,
          m.examFileName,
          m.keyFileName,
          m.questionCount,
          m.optionCount,
          JSON.stringify(m.answerKey),
          JSON.stringify(m.ranges),
          JSON.stringify(m.responses),
          m.submittedAt,
          m.createdAt,
          m.updatedAt,
        ],
      );
    }
  }

  /* ----------------------- Métodos Internos de Leitura ----------------------- */

  private getDisciplines(userId: string): Discipline[] {
    const rows = this.db.all<{
      id: string;
      name: string;
      color: string;
      active: number;
      sort_order: number;
      kind: Discipline['kind'];
    }>(
      `SELECT id, name, color, active, sort_order, kind
       FROM disciplines
       WHERE user_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      active: Boolean(r.active),
      order: r.sort_order,
      kind: r.kind,
    }));
  }

  private getTopics(userId: string): Topic[] {
    const rows = this.db.all<{
      id: string;
      discipline_id: string;
      title: string;
      parent_topic_id: string | null;
      status: Topic['status'];
      notes: string;
      sort_order: number;
      active: number;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, discipline_id, title, parent_topic_id, status, notes, sort_order, active, created_at, updated_at
       FROM topics
       WHERE user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      disciplineId: r.discipline_id,
      title: r.title,
      parentTopicId: r.parent_topic_id,
      status: r.status,
      notes: r.notes,
      order: r.sort_order,
      active: Boolean(r.active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private getSessions(userId: string): StudySession[] {
    const sessionRows = this.db.all<{
      id: string;
      date: string;
      discipline_id: string;
      topic_id: string | null;
      planned_start: string | null;
      planned_minutes: number;
      actual_seconds: number;
      status: StudySession['status'];
      objective: string;
      notes: string;
      origin: StudySession['origin'];
      started_at: string | null;
      ended_at: string | null;
      recovered_from_id: string | null;
      is_manual: number | null;
      sort_order: number | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, date, discipline_id, topic_id, planned_start, planned_minutes,
              actual_seconds, status, objective, notes, origin, started_at, ended_at,
              recovered_from_id, is_manual, sort_order, created_at, updated_at
       FROM study_sessions
       WHERE user_id = ?
       ORDER BY date ASC, COALESCE(sort_order, 999999) ASC, created_at ASC`,
      [userId],
    );

    const historyRows = this.db.all<{
      session_id: string;
      occurred_at: string;
      entry_type: SessionHistoryEntry['type'];
      description: string;
    }>(
      `SELECT session_id, occurred_at, entry_type, description
       FROM study_session_history
       WHERE user_id = ?
       ORDER BY session_id ASC, seq ASC`,
      [userId],
    );

    const historyMap = new Map<string, SessionHistoryEntry[]>();
    for (const h of historyRows) {
      let list = historyMap.get(h.session_id);
      if (!list) {
        list = [];
        historyMap.set(h.session_id, list);
      }
      list.push({
        at: h.occurred_at,
        type: h.entry_type,
        description: h.description,
      });
    }

    return sessionRows.map((r) => {
      const session: StudySession = {
        id: r.id,
        date: r.date,
        disciplineId: r.discipline_id,
        topicId: r.topic_id,
        plannedStart: r.planned_start,
        plannedMinutes: r.planned_minutes,
        actualSeconds: r.actual_seconds,
        status: r.status,
        objective: r.objective,
        notes: r.notes,
        origin: r.origin,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        recoveredFromId: r.recovered_from_id,
        history: historyMap.get(r.id) ?? [],
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
      if (r.is_manual !== null) {
        session.isManual = Boolean(r.is_manual);
      }
      if (r.sort_order !== null) {
        session.order = r.sort_order;
      }
      return session;
    });
  }

  private getTimers(userId: string): TimerState[] {
    const rows = this.db.all<{
      session_id: string | null;
      status: TimerState['status'];
      started_at: number | null;
      first_started_at: number;
      accumulated_seconds: number;
      planned_seconds: number;
      discipline_id: string;
      topic_id: string | null;
      objective: string;
      notes: string;
      updated_at: number;
    }>(
      `SELECT session_id, status, started_at, first_started_at, accumulated_seconds,
              planned_seconds, discipline_id, topic_id, objective, notes, updated_at
       FROM timer_states
       WHERE user_id = ?`,
      [userId],
    );
    return rows.map((r) => ({
      id: ACTIVE_TIMER_ID,
      sessionId: r.session_id,
      status: r.status,
      startedAt: r.started_at,
      firstStartedAt: r.first_started_at,
      accumulatedSeconds: r.accumulated_seconds,
      plannedSeconds: r.planned_seconds,
      disciplineId: r.discipline_id,
      topicId: r.topic_id,
      objective: r.objective,
      notes: r.notes,
      updatedAt: r.updated_at,
    }));
  }

  private getQuestionLogs(userId: string): QuestionLog[] {
    const rows = this.db.all<{
      id: string;
      date: string;
      discipline_id: string;
      topic_id: string | null;
      source: string;
      total: number;
      correct: number;
      incorrect: number;
      blank: number;
      duration_minutes: number | null;
      notes: string;
      session_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, date, discipline_id, topic_id, source, total, correct, incorrect,
              blank, duration_minutes, notes, session_id, created_at, updated_at
       FROM question_logs
       WHERE user_id = ?
       ORDER BY date DESC, created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      disciplineId: r.discipline_id,
      topicId: r.topic_id,
      source: r.source,
      total: r.total,
      correct: r.correct,
      incorrect: r.incorrect,
      blank: r.blank,
      durationMinutes: r.duration_minutes,
      notes: r.notes,
      sessionId: r.session_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private getErrorNotes(userId: string): ErrorNote[] {
    const rows = this.db.all<{
      id: string;
      question_log_id: string | null;
      discipline_id: string;
      topic_id: string | null;
      source_reference: string;
      error_type: ErrorNote['errorType'];
      explanation: string;
      error_date: string;
      status: ErrorNote['status'];
      next_review_date: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, question_log_id, discipline_id, topic_id, source_reference,
              error_type, explanation, error_date, status, next_review_date,
              created_at, updated_at
       FROM error_notes
       WHERE user_id = ?
       ORDER BY error_date DESC, created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      questionLogId: r.question_log_id,
      disciplineId: r.discipline_id,
      topicId: r.topic_id,
      sourceReference: r.source_reference,
      errorType: r.error_type,
      explanation: r.explanation,
      errorDate: r.error_date,
      status: r.status,
      nextReviewDate: r.next_review_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  private getReviews(userId: string): ReviewTask[] {
    const rows = this.db.all<{
      id: string;
      discipline_id: string;
      topic_id: string | null;
      error_note_id: string | null;
      title: string;
      due_date: string;
      interval_days: number;
      status: ReviewTask['status'];
      completed_at: string | null;
      created_at: string;
    }>(
      `SELECT id, discipline_id, topic_id, error_note_id, title, due_date,
              interval_days, status, completed_at, created_at
       FROM review_tasks
       WHERE user_id = ?
       ORDER BY due_date ASC, created_at ASC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      disciplineId: r.discipline_id,
      topicId: r.topic_id,
      errorNoteId: r.error_note_id,
      title: r.title,
      dueDate: r.due_date,
      intervalDays: r.interval_days,
      status: r.status,
      completedAt: r.completed_at,
      createdAt: r.created_at,
    }));
  }

  private getWeeklyPlans(userId: string): WeeklyPlan[] {
    const rows = this.db.all<{
      id: string;
      week_index: number;
      week_start: string;
      objectives: string;
      planned_content: string;
      planned_minutes: number;
      status: WeeklyPlan['status'];
      notes: string;
    }>(
      `SELECT id, week_index, week_start, objectives, planned_content,
              planned_minutes, status, notes
       FROM weekly_plans
       WHERE user_id = ?
       ORDER BY week_index ASC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      weekIndex: r.week_index,
      weekStart: r.week_start,
      objectives: r.objectives,
      plannedContent: r.planned_content,
      plannedMinutes: r.planned_minutes,
      status: r.status,
      notes: r.notes,
    }));
  }

  private getSettingsList(userId: string): Settings[] {
    const row = this.db.get<{
      daily_goal_minutes: number;
      weekly_goal_minutes: number;
      daily_question_goal: number | null;
      accuracy_goal: number;
      topic_completion_goal: number | null;
      review_intervals_json: string;
      theme: Settings['theme'];
      exam_date: string | null;
      schedule_start_date: string | null;
      schedule_weeks: number;
      distribution_json: string;
      gemini_api_key: string | null;
      ai_provider: 'builtin' | 'gemini';
    }>(
      `SELECT daily_goal_minutes, weekly_goal_minutes, daily_question_goal,
              accuracy_goal, topic_completion_goal, review_intervals_json,
              theme, exam_date, schedule_start_date, schedule_weeks,
              distribution_json, gemini_api_key, ai_provider
       FROM user_settings
       WHERE user_id = ?`,
      [userId],
    );
    if (!row) return [];
    return [
      {
        id: SETTINGS_ID,
        dailyGoalMinutes: row.daily_goal_minutes,
        weeklyGoalMinutes: row.weekly_goal_minutes,
        dailyQuestionGoal: row.daily_question_goal,
        accuracyGoal: row.accuracy_goal,
        topicCompletionGoal: row.topic_completion_goal,
        reviewIntervals: JSON.parse(row.review_intervals_json) as number[],
        theme: row.theme,
        examDate: row.exam_date,
        scheduleStartDate: row.schedule_start_date,
        scheduleWeeks: row.schedule_weeks,
        distribution: {
          ...DEFAULT_SETTINGS.distribution,
          ...(JSON.parse(row.distribution_json) as Record<string, number>),
        },
        geminiApiKey: this.cipher
          ? this.cipher.decrypt(row.gemini_api_key ?? '')
          : (row.gemini_api_key ?? ''),
        aiProvider: row.ai_provider ?? 'builtin',
      },
    ];
  }

  private getMockExams(userId: string): MockExam[] {
    const rows = this.db.all<{
      id: string;
      title: string;
      exam_file_name: string | null;
      key_file_name: string | null;
      question_count: number;
      option_count: number;
      answer_key_json: string;
      ranges_json: string;
      responses_json: string;
      submitted_at: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id, title, exam_file_name, key_file_name, question_count, option_count,
              answer_key_json, ranges_json, responses_json, submitted_at, created_at, updated_at
       FROM mock_exams
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      examFileName: r.exam_file_name,
      keyFileName: r.key_file_name,
      questionCount: r.question_count,
      optionCount: r.option_count,
      answerKey: JSON.parse(r.answer_key_json) as Record<string, string>,
      ranges: JSON.parse(r.ranges_json) as MockExam['ranges'],
      responses: JSON.parse(r.responses_json) as Record<string, string | null>,
      submittedAt: r.submitted_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }
}
