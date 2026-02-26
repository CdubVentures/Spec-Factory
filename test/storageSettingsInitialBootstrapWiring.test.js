import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_PAGE = path.resolve('tools/gui-react/src/pages/storage/StoragePage.tsx');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('storage settings local state initializes from authority bootstrap cache', () => {
  const storagePageText = readText(STORAGE_PAGE);

  assert.equal(
    storagePageText.includes('useStorageSettingsBootstrap'),
    true,
    'StoragePage should import storage bootstrap selector hook from authority',
  );
  assert.equal(
    storagePageText.includes('const storageSettingsBootstrap = useStorageSettingsBootstrap();'),
    true,
    'StoragePage bootstrap should read storage settings via shared authority selector hook',
  );
  assert.equal(
    storagePageText.includes('useQueryClient()'),
    false,
    'StoragePage should not directly instantiate query client just for bootstrap reads',
  );
  assert.equal(
    storagePageText.includes("queryClient.getQueryData<Record<string, unknown>>(['storage-settings'])"),
    false,
    'StoragePage should not read storage settings cache key directly',
  );
  assert.equal(
    storagePageText.includes('const [form, setForm] = useState<StorageSettingsFormState>(() => toFormState(storageSettingsBootstrap));'),
    true,
    'storage form local state should initialize from authority bootstrap',
  );
  assert.equal(
    storagePageText.includes('const [hasS3SecretAccessKey, setHasS3SecretAccessKey] = useState(storageSettingsBootstrap.hasS3SecretAccessKey);'),
    true,
    'storage S3 secret flag should initialize from authority bootstrap',
  );
  assert.equal(
    storagePageText.includes('const [hasS3SessionToken, setHasS3SessionToken] = useState(storageSettingsBootstrap.hasS3SessionToken);'),
    true,
    'storage S3 session token flag should initialize from authority bootstrap',
  );
  assert.equal(
    storagePageText.includes('form: emptyFormState(),'),
    false,
    'saved comparable baseline should not initialize from hardcoded empty form state',
  );
});
