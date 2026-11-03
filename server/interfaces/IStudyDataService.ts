import type { DataTableName } from '../../src/db/types';
import type { StudyWorkspaceDto } from '../dtos/study-data.dto';

/**
 * Contrato do serviço de domínio dos dados de estudo do usuário (ISP & DIP).
 */
export interface IStudyDataService {
  getWorkspace(userId: string): Promise<StudyWorkspaceDto>;
  executeBatch(userId: string, rawBody: unknown): Promise<StudyWorkspaceDto>;
  mutateTable(userId: string, tableParam: string, rawBody: unknown): Promise<void>;
  replaceWorkspace(userId: string, rawBody: unknown): Promise<StudyWorkspaceDto>;
  resetWorkspace(userId: string): Promise<StudyWorkspaceDto>;
  parseTableName(tableParam: string): DataTableName;
}
