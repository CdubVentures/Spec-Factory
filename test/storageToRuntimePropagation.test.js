import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRunDataStorageSettings,
} from '../src/api/services/runDataRelocationService.js';

describe('Storage → Runtime config propagation', () => {
  describe('normalizeRunDataStorageSettings awsRegion rename', () => {
    it('reads awsRegion from next input', () => {
      const result = normalizeRunDataStorageSettings({ awsRegion: 'eu-west-1' });
      assert.equal(result.awsRegion, 'eu-west-1');
    });

    it('migrates legacy s3Region from next input', () => {
      const result = normalizeRunDataStorageSettings({ s3Region: 'ap-southeast-1' });
      assert.equal(result.awsRegion, 'ap-southeast-1');
    });

    it('prefers awsRegion over s3Region when both present', () => {
      const result = normalizeRunDataStorageSettings({
        awsRegion: 'us-west-2',
        s3Region: 'eu-central-1',
      });
      assert.equal(result.awsRegion, 'us-west-2');
    });

    it('reads awsRegion from fallback when next is empty', () => {
      const result = normalizeRunDataStorageSettings({}, { awsRegion: 'eu-west-1' });
      assert.equal(result.awsRegion, 'eu-west-1');
    });

    it('reads legacy s3Region from fallback when awsRegion absent', () => {
      const result = normalizeRunDataStorageSettings({}, { s3Region: 'ap-northeast-1' });
      assert.equal(result.awsRegion, 'ap-northeast-1');
    });

    it('uses DEFAULT_S3_REGION when nothing provided', () => {
      const result = normalizeRunDataStorageSettings({});
      assert.equal(result.awsRegion, 'us-east-2');
    });

    it('output object has awsRegion key, not s3Region', () => {
      const result = normalizeRunDataStorageSettings({ awsRegion: 'us-west-2' });
      assert.ok(Object.hasOwn(result, 'awsRegion'));
      assert.ok(!Object.hasOwn(result, 's3Region'));
    });
  });

  describe('Storage save propagates to config', () => {
    it('config receives awsRegion from storage state on simulated save', () => {
      const config = { awsRegion: 'us-east-1', s3Bucket: '' };
      const runDataStorageState = normalizeRunDataStorageSettings({
        awsRegion: 'eu-west-1',
        s3Bucket: 'new-bucket',
      });
      const propagatedRegion = String(runDataStorageState.awsRegion || '').trim();
      const propagatedBucket = String(runDataStorageState.s3Bucket || '').trim();
      if (propagatedRegion) config.awsRegion = propagatedRegion;
      if (propagatedBucket) config.s3Bucket = propagatedBucket;
      assert.equal(config.awsRegion, 'eu-west-1');
      assert.equal(config.s3Bucket, 'new-bucket');
    });

    it('does not overwrite config.s3Bucket when storage bucket is empty', () => {
      const config = { awsRegion: 'us-east-1', s3Bucket: 'existing' };
      const runDataStorageState = normalizeRunDataStorageSettings({
        awsRegion: 'us-west-2',
        s3Bucket: '',
      });
      const propagatedRegion = String(runDataStorageState.awsRegion || '').trim();
      const propagatedBucket = String(runDataStorageState.s3Bucket || '').trim();
      if (propagatedRegion) config.awsRegion = propagatedRegion;
      if (propagatedBucket) config.s3Bucket = propagatedBucket;
      assert.equal(config.awsRegion, 'us-west-2');
      assert.equal(config.s3Bucket, 'existing');
    });
  });
});
