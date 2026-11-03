import type { DataTableName } from '../../src/db/types';
import type { StudyWorkspaceDto, TableMutationOperationDto } from '../dtos/study-data.dto';

/**
 * Contrato de persistência para todos os dados de estudo intrinsecamente vinculados ao usuário (ISP & DIP).
 * Permite implementações síncronas (memória/sqlite) ou assíncronas (MongoDB).
 */
export interface IStudyDataRepository {
  ensureUserSeed(userId: string): Promise<void> | void;
  getWorkspace(userId: string): Promise<StudyWorkspaceDto> | StudyWorkspaceDto;
  replaceWorkspace(userId: string, workspace: StudyWorkspaceDto): Promise<StudyWorkspaceDto> | StudyWorkspaceDto;
  resetWorkspace(userId: string): Promise<StudyWorkspaceDto> | StudyWorkspaceDto;
  deleteUserWorkspace(userId: string): Promise<void> | void;
  applyBatch(userId: string, operations: readonly TableMutationOperationDto[]): Promise<void> | void;
  upsertTable(userId: string, table: DataTableName, records: readonly unknown[]): Promise<void> | void;
  deleteFromTable(userId: string, table: DataTableName, ids: readonly string[]): Promise<void> | void;
  clearTable(userId: string, table: DataTableName): Promise<void> | void;
}
