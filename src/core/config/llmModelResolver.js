// WHY: S3 credential checking and ChatMock directory defaults.

import path from 'node:path';

export function hasS3EnvCreds() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );
}

export function defaultChatmockDir() {
  const profile = String(process.env.USERPROFILE || '').trim();
  if (!profile) {
    return '';
  }
  return path.join(profile, 'Desktop', 'ChatMock');
}
