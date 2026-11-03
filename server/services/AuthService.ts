import { deterministicUserIdFromEmail } from '../database/seedFirefoxData';
import {
  parseLoginDto,
  parseRegisterDto,
  toAuthResponseDto,
  toUserResponseDto,
  type AuthResponseDto,
  type LoginRequestDto,
  type RegisterRequestDto,
  type UserResponseDto,
} from '../dtos/auth.dto';
import { ConflictError, NotFoundError, UnauthorizedError } from '../errors/AppError';
import type { IAuthService } from '../interfaces/IAuthService';
import type { IPasswordHasher } from '../interfaces/IPasswordHasher';
import type { IStudyDataRepository } from '../interfaces/IStudyDataRepository';
import type { ITokenService } from '../interfaces/ITokenService';
import type { IUserRepository } from '../interfaces/IUserRepository';

/**
 * Serviço de domínio de Autenticação (SRP, OCP & DIP).
 * Depende exclusivamente de abstrações injetadas pelo construtor.
 */
export class AuthService implements IAuthService {
  private readonly userRepository: IUserRepository;
  private readonly studyDataRepository: IStudyDataRepository;
  private readonly passwordHasher: IPasswordHasher;
  private readonly tokenService: ITokenService;

  constructor(
    userRepository: IUserRepository,
    studyDataRepository: IStudyDataRepository,
    passwordHasher: IPasswordHasher,
    tokenService: ITokenService,
  ) {
    this.userRepository = userRepository;
    this.studyDataRepository = studyDataRepository;
    this.passwordHasher = passwordHasher;
    this.tokenService = tokenService;
  }

  public validateRegisterDto(input: unknown): RegisterRequestDto {
    return parseRegisterDto(input);
  }

  public validateLoginDto(input: unknown): LoginRequestDto {
    return parseLoginDto(input);
  }

  public async register(input: unknown): Promise<AuthResponseDto> {
    const dto = this.validateRegisterDto(input);
    const existing = await this.userRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictError('Já existe uma conta cadastrada com este e-mail.');
    }

    const passwordHash = await this.passwordHasher.hash(dto.password);
    const now = new Date().toISOString();
    const user = await this.userRepository.create({
      id: deterministicUserIdFromEmail(dto.email),
      name: dto.name,
      email: dto.email,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Inicializa as 8 disciplinas padrão e configurações do usuário recém-cadastrado
    await this.studyDataRepository.ensureUserSeed(user.id);

    const { token, expiresIn } = this.tokenService.generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return toAuthResponseDto(user, token, expiresIn);
  }

  public async login(input: unknown): Promise<AuthResponseDto> {
    const dto = this.validateLoginDto(input);
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    const validPassword = await this.passwordHasher.verify(dto.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    await this.studyDataRepository.ensureUserSeed(user.id);

    const { token, expiresIn } = this.tokenService.generateToken({
      sub: user.id,
      email: user.email,
      name: user.name,
    });

    return toAuthResponseDto(user, token, expiresIn);
  }

  public async getProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado.');
    }
    return toUserResponseDto(user);
  }

  public async deleteAccount(userId: string): Promise<void> {
    await this.studyDataRepository.deleteUserWorkspace(userId);
    const deleted = await this.userRepository.deleteById(userId);
    if (!deleted) {
      throw new NotFoundError('Usuário não encontrado.');
    }
  }
}
