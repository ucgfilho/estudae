import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { IDatabaseClient, RunResult, SqlPrimitive } from '../interfaces/IDatabaseClient';
import { RELATIONAL_SCHEMA_SQL } from './schema';

/**
 * Implementação concreta de IDatabaseClient (SRP, LSP & DIP) usando `node:sqlite`
 * com integridade referencial ativa (`PRAGMA foreign_keys = ON`), modo WAL para
 * alta concorrência e suporte a transações aninhadas via SAVEPOINT.
 */
export class SqliteDatabaseClient implements IDatabaseClient {
  private readonly db: DatabaseSync;
  private txDepth = 0;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }
    this.db.exec(RELATIONAL_SCHEMA_SQL);
    try {
      this.db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT NULL;');
    } catch {
      // Coluna já existente
    }
    for (const col of ['contest_id', 'contest_name', 'contest_role', 'edital_file_name']) {
      try {
        this.db.exec(`ALTER TABLE user_settings ADD COLUMN ${col} TEXT NULL;`);
      } catch {
        // Coluna já existente
      }
    }
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, params: readonly SqlPrimitive[] = []): RunResult {
    const stmt = this.db.prepare(sql);
    const res = stmt.run(...params);
    return {
      changes: res.changes,
      lastInsertRowid: res.lastInsertRowid,
    };
  }

  public get<T = Record<string, unknown>>(sql: string, params: readonly SqlPrimitive[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  public all<T = Record<string, unknown>>(sql: string, params: readonly SqlPrimitive[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public transaction<T>(fn: () => T): T {
    const isOuter = this.txDepth === 0;
    const savepoint = `sp_${this.txDepth}`;
    this.txDepth++;
    if (isOuter) {
      this.db.exec('BEGIN IMMEDIATE TRANSACTION;');
    } else {
      this.db.exec(`SAVEPOINT ${savepoint};`);
    }
    try {
      const result = fn();
      if (isOuter) {
        this.db.exec('COMMIT;');
      } else {
        this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
      }
      return result;
    } catch (err) {
      if (isOuter) {
        this.db.exec('ROLLBACK;');
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
      }
      throw err;
    } finally {
      this.txDepth--;
    }
  }

  public close(): void {
    this.db.close();
  }
}
