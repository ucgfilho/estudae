import { MongoClient, type Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export interface MongoConfig {
  uri: string;
  dbName?: string;
}

/**
 * Retorna uma conexão reutilizável com o MongoDB, otimizada para Serverless (Vercel) e instâncias Node.js.
 * Segue as recomendações da skill mongodb-connection:
 * - maxPoolSize moderado (10) para evitar esgotamento de conexões em funções serverless paralelas.
 * - minPoolSize: 0 para permitir liberação de conexões ociosas.
 * - maxIdleTimeMS: 30000ms para evitar conexões presas na nuvem.
 * - Reutilização global de cliente fora do ciclo de vida das requisições.
 */
export async function getMongoDb(config: MongoConfig): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  if (!clientPromise) {
    const client = new MongoClient(config.uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    clientPromise = client
      .connect()
      .then((c) => {
        cachedClient = c;
        return c;
      })
      .catch((err) => {
        clientPromise = null;
        cachedClient = null;
        cachedDb = null;
        throw err;
      });
  }

  const client = await clientPromise;
  cachedDb = client.db(config.dbName || 'bnb_estudos');
  return cachedDb;
}

export async function closeMongoConnection(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
    clientPromise = null;
  }
}
