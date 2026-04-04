import fs from 'node:fs/promises';
import path from 'node:path';
import { configValue } from '../../shared/settingsAccessor.js';
import { OUTPUT_KEY_PREFIX } from '../../shared/storageKeyPrefixes.js';

function toPosixKey(...parts) {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

class LocalStorage {
  constructor(config) {
    this.outputRoot = path.resolve(configValue(config, 'localOutputRoot'));
    this.outputPrefix = OUTPUT_KEY_PREFIX;
  }

  resolveLocalPath(key) {
    const pfx = `${this.outputPrefix}/`;
    const stripped = key.startsWith(pfx) ? key.slice(pfx.length) : key;
    return path.join(this.outputRoot, ...stripped.split('/'));
  }

  async listKeys(prefix) {
    const root = path.join(this.outputRoot, ...String(prefix || '').split('/'));
    const keys = [];

    const walk = async (dir) => {
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (error) {
        if (error.code === 'ENOENT') {
          return;
        }
        throw error;
      }

      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
          continue;
        }
        const rel = path.relative(this.outputRoot, full).split(path.sep).join('/');
        keys.push(rel);
      }
    };

    await walk(root);
    return keys.sort();
  }

  async readJson(key) {
    const content = await this.readText(key);
    return JSON.parse(content);
  }

  async readText(key) {
    const fullPath = this.resolveLocalPath(key);
    return await fs.readFile(fullPath, 'utf8');
  }

  async readBuffer(key) {
    const fullPath = this.resolveLocalPath(key);
    return await fs.readFile(fullPath);
  }

  async readJsonOrNull(key) {
    try {
      return await this.readJson(key);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      // WHY: Corrupted JSON should not crash the caller — return null
      // so fallback chains (e.g. billing rollup) can continue.
      if (err instanceof SyntaxError) {
        return null;
      }
      throw err;
    }
  }

  async readTextOrNull(key) {
    try {
      return await this.readText(key);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async writeObject(key, body) {
    const fullPath = this.resolveLocalPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body);
  }

  async appendText(key, text) {
    const fullPath = this.resolveLocalPath(key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.appendFile(fullPath, String(text || ''), 'utf8');
  }

  async objectExists(key) {
    const fullPath = this.resolveLocalPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  async deleteObject(key) {
    const fullPath = this.resolveLocalPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  resolveOutputKey(...parts) {
    const pfx = this.outputPrefix;
    const cleaned = parts.map(p => {
      const s = String(p || '');
      return s.startsWith(`${pfx}/`) ? s.slice(pfx.length + 1) : s;
    });
    return toPosixKey(pfx, ...cleaned);
  }
}

export function createStorage(config) {
  return new LocalStorage(config);
}

export { toPosixKey };
