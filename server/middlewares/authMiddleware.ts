import type { IncomingHttpHeaders } from 'node:http';
import type { TokenPayloadDto } from '../dtos/auth.dto';
import { UnauthorizedError } from '../errors/AppError';
import type { ITokenService } from '../interfaces/ITokenService';
import type { IUserRepository } from '../interfaces/IUserRepository';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Extrai e valida o Bearer Token (JWT) do cabeçalho Authorization (SRP & DIP).
 */
export class BearerAuthGuard {
  private readonly tokenService: ITokenService;
  private readonly userRepository: IUserRepository;
  private readonly allowStatelessRecovery: boolean;

  constructor(
    tokenService: ITokenService,
    userRepository: IUserRepository,
    allowStatelessRecovery = false,
  ) {
    this.tokenService = tokenService;
    this.userRepository = userRepository;
    this.allowStatelessRecovery = allowStatelessRecovery;
  }

  public async authenticate(headers: IncomingHttpHeaders): Promise<AuthenticatedUser> {
    const authHeader = headers.authorization ?? headers.Authorization;
    const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!rawHeader || typeof rawHeader !== 'string') {
      throw new UnauthorizedError('Cabeçalho Authorization Bearer ausente.');
    }

    const match = /^Bearer\s+(.+)$/i.exec(rawHeader.trim());
    if (!match || !match[1]) {
      throw new UnauthorizedError('Formato de autenticação inválido. Utilize "Bearer <token>".');
    }

    const payload: TokenPayloadDto = this.tokenService.verifyToken(match[1].trim());
    let user =
      (await this.userRepository.findById(payload.sub)) ??
      (await this.userRepository.findByEmail(payload.email));

    if (!user && this.allowStatelessRecovery) {
      const now = new Date().toISOString();
      user = await this.userRepository.create({
        id: payload.sub,
        name: payload.name || payload.email.split('@')[0] || 'Titular da Conta',
        email: payload.email,
        passwordHash:
          '$scrypt$16384$8$1$00000000000000000000000000000000$00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
        createdAt: now,
        updatedAt: now,
      });
    }

    if (!user) {
      throw new UnauthorizedError('Usuário associado ao token não existe mais.');
    }

    if (
      user.id !== payload.sub ||
      user.email.trim().toLowerCase() !== payload.email.trim().toLowerCase()
    ) {
      throw new UnauthorizedError('Violação RLS: identidade do token diverge do registro do titular.');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
