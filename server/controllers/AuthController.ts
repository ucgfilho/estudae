import type { AuthResponseDto, UserResponseDto } from '../dtos/auth.dto';
import type { IAuthService } from '../interfaces/IAuthService';
import type { AuthenticatedUser } from '../middlewares/authMiddleware';

/**
 * Controlador de Autenticação (SRP & DIP).
 * Recebe requisições desacopladas e delega ao IAuthService.
 */
export class AuthController {
  private readonly authService: IAuthService;

  constructor(authService: IAuthService) {
    this.authService = authService;
  }

  public async register(body: unknown): Promise<{ status: number; data: AuthResponseDto }> {
    const data = await this.authService.register(body);
    return { status: 201, data };
  }

  public async login(body: unknown): Promise<{ status: number; data: AuthResponseDto }> {
    const data = await this.authService.login(body);
    return { status: 200, data };
  }

  public async me(user: AuthenticatedUser): Promise<{ status: number; data: { user: UserResponseDto } }> {
    const profile = await this.authService.getProfile(user.id);
    return { status: 200, data: { user: profile } };
  }

  public async updateMe(
    user: AuthenticatedUser,
    body: unknown,
  ): Promise<{ status: number; data: { user: UserResponseDto } }> {
    const profile = await this.authService.updateProfile(user.id, body);
    return { status: 200, data: { user: profile } };
  }

  public async deleteAccount(
    user: AuthenticatedUser,
  ): Promise<{ status: number; data: { deleted: true } }> {
    await this.authService.deleteAccount(user.id);
    return { status: 200, data: { deleted: true } };
  }
}
