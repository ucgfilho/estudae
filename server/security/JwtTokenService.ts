import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { TokenPayloadDto } from '../dtos/auth.dto';
import { UnauthorizedError } from '../errors/AppError';
import type { ITokenService } from '../interfaces/ITokenService';

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience: string;
  expiresInSeconds: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

/**
 * Implementação de ITokenService (SRP & DIP) conforme RFC 7519 (JWT HS256).
 */
export class JwtTokenService implements ITokenService {
  private readonly config: JwtConfig;

  constructor(config: JwtConfig) {
    this.config = config;
  }

  public generateToken(payload: Omit<TokenPayloadDto, 'jti' | 'iat' | 'exp' | 'iss' | 'aud'>): {
    token: string;
    expiresIn: number;
  } {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fullPayload = {
      ...payload,
      jti: randomUUID(),
      iat: nowSeconds,
      exp: nowSeconds + this.config.expiresInSeconds,
      iss: this.config.issuer,
      aud: this.config.audience,
    };

    const headerPart = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payloadPart = base64UrlEncode(JSON.stringify(fullPayload));
    const signingInput = `${headerPart}.${payloadPart}`;
    const signature = this.sign(signingInput);

    return {
      token: `${signingInput}.${signature}`,
      expiresIn: this.config.expiresInSeconds,
    };
  }

  public verifyToken(token: string): TokenPayloadDto {
    const parts = token.trim().split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedError('Token JWT malformado.');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const signingInput = `${headerPart}.${payloadPart}`;
    const expectedSignature = this.sign(signingInput);

    const actualBuf = Buffer.from(signaturePart);
    const expectedBuf = Buffer.from(expectedSignature);
    if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
      throw new UnauthorizedError('Assinatura do token JWT inválida.');
    }

    let header: { alg?: string; typ?: string };
    let payload: TokenPayloadDto;
    try {
      header = JSON.parse(base64UrlDecode(headerPart));
      payload = JSON.parse(base64UrlDecode(payloadPart));
    } catch {
      throw new UnauthorizedError('Conteúdo do token JWT inválido.');
    }

    if (header?.alg !== 'HS256') {
      throw new UnauthorizedError('Algoritmo JWT não suportado.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSeconds) {
      throw new UnauthorizedError('Sessão expirada. Faça login novamente.');
    }
    if (payload.iss !== this.config.issuer || payload.aud !== this.config.audience) {
      throw new UnauthorizedError('Emissor ou audiência do token JWT inválidos.');
    }
    if (
      typeof payload.sub !== 'string' || !payload.sub ||
      typeof payload.email !== 'string' || !payload.email
    ) {
      throw new UnauthorizedError('Payload do token JWT incompleto.');
    }

    return payload;
  }

  private sign(input: string): string {
    return createHmac('sha256', this.config.secret).update(input).digest('base64url');
  }
}
