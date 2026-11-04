import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  UserResponseDto,
} from '../dtos/auth.dto';

/**
 * Contrato do serviço de autenticação e gerenciamento de conta de usuário (ISP & DIP).
 */
export interface IAuthService {
  register(input: unknown): Promise<AuthResponseDto>;
  login(input: unknown): Promise<AuthResponseDto>;
  getProfile(userId: string): Promise<UserResponseDto>;
  updateProfile(userId: string, input: unknown): Promise<UserResponseDto>;
  deleteAccount(userId: string): Promise<void>;
  validateRegisterDto(input: unknown): RegisterRequestDto;
  validateLoginDto(input: unknown): LoginRequestDto;
}
