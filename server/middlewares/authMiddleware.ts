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

  constructor(
    tokenService: ITokenService,
    userRepository: IUserRepository,
  ) {
    this.tokenService = tokenService;
    this.userRepository = userRepository;
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
    const user = await this.userRepository.findById(payload.sub);

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
