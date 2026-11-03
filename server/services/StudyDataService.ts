import type { DataTableName } from '../../src/db/types';
import {
  parseBatchRequestDto,
  parseSingleTableMutationDto,
  parseStudyWorkspaceDto,
  tableNameSchema,
  type StudyWorkspaceDto,
} from '../dtos/study-data.dto';
import { DtoValidationError } from '../errors/AppError';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';
import type { IStudyDataService } from '../interfaces/IStudyDataService';

/**
 * Serviço de domínio para gerenciamento dos dados de estudo do usuário (SRP, OCP & DIP).
 */
export class StudyDataService implements IStudyDataService {
  private readonly repository: IStudyDataRepository;

  constructor(repository: IStudyDataRepository) {
    this.repository = repository;
  }

  public parseTableName(tableParam: string): DataTableName {
    const parsed = tableNameSchema.safeParse(tableParam);
    if (!parsed.success) {
      throw new DtoValidationError(`Tabela inválida: ${tableParam}`);
    }
    return parsed.data;
  }

  public async getWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    return this.repository.getWorkspace(userId);
  }

  public async executeBatch(userId: string, rawBody: unknown): Promise<StudyWorkspaceDto> {
    const dto = parseBatchRequestDto(rawBody);
    await this.repository.applyBatch(userId, dto.operations);
    return this.repository.getWorkspace(userId);
  }

  public async mutateTable(userId: string, tableParam: string, rawBody: unknown): Promise<void> {
    const table = this.parseTableName(tableParam);
    const dto = parseSingleTableMutationDto(rawBody);
    if (dto.action === 'clear') {
      await this.repository.clearTable(userId, table);
    } else if (dto.action === 'delete') {
      await this.repository.deleteFromTable(userId, table, dto.ids);
    } else {
      await this.repository.upsertTable(userId, table, dto.records);
    }
  }

  public async replaceWorkspace(userId: string, rawBody: unknown): Promise<StudyWorkspaceDto> {
    const payload =
      rawBody && typeof rawBody === 'object' && 'data' in rawBody
        ? (rawBody as { data: unknown }).data
        : rawBody;
    const dto = parseStudyWorkspaceDto(payload);
    return this.repository.replaceWorkspace(userId, dto);
  }

  public async resetWorkspace(userId: string): Promise<StudyWorkspaceDto> {
    return this.repository.resetWorkspace(userId);
  }
}
