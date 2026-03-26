import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function writeUtf8(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function createRelocationWorkspace(testContext, prefix) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

  testContext.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  return {
    tempRoot,
    outputRoot: path.join(tempRoot, 'out'),
    indexLabRoot: path.join(tempRoot, 'artifacts', 'indexlab'),
    destinationRoot: path.join(tempRoot, 'archive'),
  };
}

export function createLocalRunDataStorageSettings(localDirectory, overrides = {}) {
  return {
    enabled: true,
    destinationType: 'local',
    localDirectory,
    awsRegion: 'us-east-2',
    s3Bucket: '',
    s3Prefix: 'spec-factory-runs',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3SessionToken: '',
    ...overrides,
  };
}
