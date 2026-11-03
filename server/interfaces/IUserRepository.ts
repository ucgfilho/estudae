export interface UserEntity {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Contrato de persistência da entidade Usuário (ISP & DIP).
 */
export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null> | UserEntity | null;
  findById(id: string): Promise<UserEntity | null> | UserEntity | null;
  create(user: CreateUserRecord): Promise<UserEntity> | UserEntity;
  deleteById(id: string): Promise<boolean> | boolean;
}
