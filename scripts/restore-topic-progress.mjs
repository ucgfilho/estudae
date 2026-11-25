import { createServer } from 'vite';

const [backupFile, mode] = process.argv.slice(2);
const { MONGODB_URI: uri, DATA_ENCRYPTION_KEY, JWT_SECRET } = process.env;
const encryptionKey = DATA_ENCRYPTION_KEY?.trim() || JWT_SECRET?.trim();

if (!backupFile || (mode && mode !== '--apply') || !uri?.trim() || !encryptionKey) {
  console.error('Uso: node --env-file=<ambiente> scripts/restore-topic-progress.mjs <backup.json> [--apply]');
  process.exit(1);
}

const vite = await createServer({ configFile: false, server: { middlewareMode: true, ws: false }, appType: 'custom' });
let closeMongoConnection;
try {
  const { loadTopicProgressBackups } = await vite.ssrLoadModule('/server/services/topicProgressBackups.ts');
  const backups = loadTopicProgressBackups(backupFile);
  if (backups.size === 0) throw new Error('Arquivo de recuperação vazio ou inválido.');

  const mongo = await vite.ssrLoadModule('/server/database/mongoClient.ts');
  closeMongoConnection = mongo.closeMongoConnection;
  const { MongoStudyDataRepository } = await vite.ssrLoadModule('/server/repositories/MongoStudyDataRepository.ts');
  const { SensitiveDataCipher } = await vite.ssrLoadModule('/server/security/SensitiveDataCipher.ts');
  const db = await mongo.getMongoDb({ uri: uri.trim() });
  const repository = new MongoStudyDataRepository(db, new SensitiveDataCipher(encryptionKey));
  const apply = mode === '--apply';
  let added = 0;
  for (const [workspaceId, history] of backups) {
    added += await repository.restoreTopicProgressBackups(workspaceId, history, apply);
  }
  console.log(apply ? `Pontos acrescentados: ${added}` : `Pontos disponíveis para recuperar: ${added}`);
} catch (error) {
  console.error(error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[URI]'));
  process.exitCode = 1;
} finally {
  await closeMongoConnection?.();
  await vite.close();
}
