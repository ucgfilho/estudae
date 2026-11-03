import type { StudyWorkspaceDto } from '../dtos/study-data.dto';
import type { IStudyDataService } from '../interfaces/IStudyDataService';
import type { AuthenticatedUser } from '../middlewares/authMiddleware';

/**
 * Controlador de Dados de Estudo (SRP & DIP).
 * Todas as operações utilizam estritamente `user.id` extraído do JWT Bearer token.
 */
export class StudyDataController {
  private readonly studyDataService: IStudyDataService;

  constructor(studyDataService: IStudyDataService) {
    this.studyDataService = studyDataService;
  }

  public async getWorkspace(user: AuthenticatedUser): Promise<{ status: number; data: { data: StudyWorkspaceDto } }> {
    const workspace = await this.studyDataService.getWorkspace(user.id);
    return { status: 200, data: { data: workspace } };
  }

  public async executeBatch(
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<{ status: number; data: { ok: true; data: StudyWorkspaceDto } }> {
    const workspace = await this.studyDataService.executeBatch(user.id, body);
    return { status: 200, data: { ok: true, data: workspace } };
  }

  public async mutateTable(
    user: AuthenticatedUser,
    table: string,
    body: unknown,
  ): Promise<{ status: number; data: { ok: true } }> {
    await this.studyDataService.mutateTable(user.id, table, body);
    return { status: 200, data: { ok: true } };
  }

  public async replaceWorkspace(
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<{ status: number; data: { ok: true; data: StudyWorkspaceDto } }> {
    const workspace = await this.studyDataService.replaceWorkspace(user.id, body);
    return { status: 200, data: { ok: true, data: workspace } };
  }

  public async resetWorkspace(
    user: AuthenticatedUser,
  ): Promise<{ status: number; data: { ok: true; data: StudyWorkspaceDto } }> {
    const workspace = await this.studyDataService.resetWorkspace(user.id);
    return { status: 200, data: { ok: true, data: workspace } };
  }
}
