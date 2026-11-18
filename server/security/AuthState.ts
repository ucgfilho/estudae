import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import { MongoServerError, type Db } from 'mongodb';
import { TooManyRequestsError } from '../errors/AppError';
import type { IDatabaseClient } from '../interfaces/IDatabaseClient';

export interface AuthState {
  increment(key: string, expiresAt: number): Promise<number>;
  revoke(key: string, expiresAt: number): Promise<void>;
  isRevoked(key: string): Promise<boolean>;
}

export function sqliteAuthState(db: IDatabaseClient): AuthState {
  db.exec(`CREATE TABLE IF NOT EXISTS auth_state (
    key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS auth_state_expiration ON auth_state (expires_at);`);
  return {
    async increment(key, expiresAt) {
      db.run('DELETE FROM auth_state WHERE expires_at <= ?', [Date.now()]);
      const row = db.get<{ count: number }>(
        `INSERT INTO auth_state (key, count, expires_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`, [key, expiresAt],
      );
      return row!.count;
    },
    async revoke(key, expiresAt) {
      db.run('INSERT OR IGNORE INTO auth_state (key, count, expires_at) VALUES (?, 1, ?)', [key, expiresAt]);
    },
    async isRevoked(key) {
      return Boolean(db.get('SELECT 1 FROM auth_state WHERE key = ? AND expires_at > ?', [key, Date.now()]));
    },
  };
}

export async function mongoAuthState(db: Db): Promise<AuthState> {
  const collection = db.collection<{ _id: string; count: number; expiresAt: Date }>('auth_state', {
    readPreference: 'primary',
  });
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return {
    async increment(key, expiresAt) {
      const increment = (upsert: boolean) => collection.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(expiresAt) } },
        { upsert, returnDocument: 'after' },
      );
      try {
        return (await increment(true))!.count;
      } catch (err) {
        if (!(err instanceof MongoServerError) || err.code !== 11000) throw err;
        return (await increment(false))!.count;
      }
    },
    async revoke(key, expiresAt) {
      try {
        await collection.updateOne(
          { _id: key }, { $setOnInsert: { count: 1, expiresAt: new Date(expiresAt) } }, { upsert: true },
        );
      } catch (err) {
        if (!(err instanceof MongoServerError) || err.code !== 11000) throw err;
      }
    },
    async isRevoked(key) {
      return Boolean(await collection.findOne({ _id: key, expiresAt: { $gt: new Date() } }));
    },
  };
}

export class AuthControls {
  private readonly proxies: Set<string>;

  constructor(
    private readonly state: Promise<AuthState>,
    private readonly secret: string,
    private readonly isVercel: boolean,
    trustedProxyIps: string[],
  ) {
    this.proxies = new Set(trustedProxyIps.map(normalizeAddress));
  }

  public async limitOrigin(req: IncomingMessage): Promise<void> {
    const edgeIp = this.isVercel ? req.headers['x-vercel-forwarded-for'] : undefined;
    const peer = normalizeAddress(req.socket.remoteAddress ?? 'unknown');
    if (typeof edgeIp === 'string' && isIP(edgeIp)) {
      await this.limit('ip', normalizeAddress(edgeIp), 25);
      return;
    }
    const forwarded = req.headers['x-forwarded-for'];
    const addresses = typeof forwarded === 'string' && this.proxies.has(peer)
      ? forwarded.split(',').map((ip) => normalizeAddress(ip.trim())).reverse()
      : [];
    const client = addresses.find((ip) => !this.proxies.has(ip));
    await this.limit('ip', client && isIP(client) ? client : peer, 25);
  }

  public async limitAccount(body: unknown): Promise<void> {
    if (!body || typeof body !== 'object' || !('email' in body) || typeof body.email !== 'string') return;
    const email = body.email.trim().toLowerCase();
    if (email && email.length <= 255) await this.limit('account', email, 12);
  }

  private async limit(scope: string, value: string, maximum: number): Promise<void> {
    const expiresAt = (Math.floor(Date.now() / 60_000) + 1) * 60_000;
    const digest = createHmac('sha256', this.secret).update(value).digest('hex');
    const state = await this.state;
    if (await state.increment(`${scope}:${digest}:${expiresAt}`, expiresAt) > maximum) {
      throw new TooManyRequestsError();
    }
  }

  public async revoke(token: string, expiresAt: number): Promise<void> {
    await (await this.state).revoke(tokenKey(token), expiresAt);
  }

  public async isRevokedTokenKey(key: string): Promise<boolean> {
    return (await this.state).isRevoked(key);
  }

  public async isRevoked(token: string): Promise<boolean> {
    return (await this.state).isRevoked(tokenKey(token));
  }
}

function tokenKey(token: string): string {
  return `token:${createHash('sha256').update(token).digest('hex')}`;
}

function normalizeAddress(ip: string): string {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}
