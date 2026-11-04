import { z } from 'zod';
import { DtoValidationError } from '../errors/AppError';
import type { UserEntity } from '../interfaces/IUserRepository';

export const registerRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.')
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um endereço de e-mail válido.')
    .max(255, 'O e-mail deve ter no máximo 255 caracteres.'),
  password: z
    .string()
    .min(6, 'A senha deve ter no mínimo 6 caracteres.')
    .max(128, 'A senha deve ter no máximo 128 caracteres.'),
});

export const loginRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Informe um endereço de e-mail válido.'),
  password: z
    .string()
    .min(1, 'Informe a sua senha.'),
});

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter no mínimo 2 caracteres.')
    .max(120, 'O nome deve ter no máximo 120 caracteres.')
    .optional(),
  avatarUrl: z
    .string()
    .max(300_000, 'A foto é grande demais. Escolha uma imagem menor.')
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Formato de foto inválido.')
    .nullable()
    .optional(),
});

export interface UpdateProfileDto {
  name?: string;
  avatarUrl?: string | null;
}

export function parseUpdateProfileDto(raw: unknown): UpdateProfileDto {
  const result = updateProfileSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    throw new DtoValidationError(messages[0] ?? 'Dados de perfil inválidos.', messages);
  }
  return result.data;
}

export interface RegisterRequestDto {
  name: string;
  email: string;
  password: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface UserResponseDto {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface AuthResponseDto {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: UserResponseDto;
}

export interface TokenPayloadDto {
  sub: string;
  email: string;
  name: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export function parseRegisterDto(raw: unknown): RegisterRequestDto {
  const result = registerRequestSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    throw new DtoValidationError(messages[0] ?? 'Dados de cadastro inválidos.', messages);
  }
  const derivedName =
    result.data.name && result.data.name.trim().length > 0
      ? result.data.name.trim()
      : result.data.email.split('@')[0];
  return {
    name: derivedName,
    email: result.data.email,
    password: result.data.password,
  };
}

export function parseLoginDto(raw: unknown): LoginRequestDto {
  const result = loginRequestSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => i.message);
    throw new DtoValidationError(messages[0] ?? 'Dados de login inválidos.', messages);
  }
  return result.data;
}

/**
 * Mapper de Entidade para DTO de resposta (remove passwordHash e campos internos).
 */
export function toUserResponseDto(entity: UserEntity): UserResponseDto {
  return {
    id: entity.id,
    name: entity.name,
    email: entity.email,
    avatarUrl: entity.avatarUrl ?? null,
    createdAt: entity.createdAt,
  };
}

export function toAuthResponseDto(
  entity: UserEntity,
  token: string,
  expiresIn: number,
): AuthResponseDto {
  return {
    token,
    tokenType: 'Bearer',
    expiresIn,
    user: toUserResponseDto(entity),
  };
}
