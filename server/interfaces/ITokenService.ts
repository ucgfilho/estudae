import type { TokenPayloadDto } from '../dtos/auth.dto';

/**
 * Contrato para emissão e validação de tokens JWT (ISP & DIP).
 */
export interface ITokenService {
  generateToken(payload: Omit<TokenPayloadDto, 'jti' | 'iat' | 'exp' | 'iss' | 'aud'>): {
    token: string;
    expiresIn: number;
  };
  verifyToken(token: string): TokenPayloadDto;
}
