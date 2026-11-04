import type { Db } from 'mongodb';
import type { CreateUserRecord, IUserRepository, UserEntity } from '../interfaces/IUserRepository';

interface UserDoc {
  _id: string; // id da aplicação
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Repositório de Usuários no MongoDB com suporte a async/await.
 * Garante índice único e normalizado por e-mail no MongoDB.
 */
export class MongoUserRepository implements IUserRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  public async initIndexes(): Promise<void> {
    await this.db.collection<UserDoc>('users').createIndex(
      { email: 1 },
      { unique: true }
    );
  }

  public async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const doc = await this.db.collection<UserDoc>('users').findOne({ email: normalized });
    if (!doc) return null;
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      passwordHash: doc.passwordHash,
      avatarUrl: doc.avatarUrl ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async findById(id: string): Promise<UserEntity | null> {
    const doc = await this.db.collection<UserDoc>('users').findOne({ _id: id });
    if (!doc) return null;
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      passwordHash: doc.passwordHash,
      avatarUrl: doc.avatarUrl ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  public async create(user: CreateUserRecord): Promise<UserEntity> {
    const normalizedEmail = user.email.trim().toLowerCase();
    const doc: UserDoc = {
      _id: user.id,
      name: user.name.trim(),
      email: normalizedEmail,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    await this.db.collection<UserDoc>('users').updateOne(
      { _id: user.id },
      { $set: doc },
      { upsert: true }
    );

    return {
      ...user,
      name: user.name.trim(),
      email: normalizedEmail,
    };
  }

  public async updateProfile(
    id: string,
    changes: { name?: string; avatarUrl?: string | null },
  ): Promise<UserEntity | null> {
    const set: Partial<UserDoc> = { updatedAt: new Date().toISOString() };
    if (changes.name?.trim()) set.name = changes.name.trim();
    if (changes.avatarUrl !== undefined) set.avatarUrl = changes.avatarUrl;
    await this.db.collection<UserDoc>('users').updateOne({ _id: id }, { $set: set });
    return this.findById(id);
  }

  public async deleteById(id: string): Promise<boolean> {
    const res = await this.db.collection<UserDoc>('users').deleteOne({ _id: id });
    return (res.deletedCount ?? 0) > 0;
  }
}
