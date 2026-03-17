// WHY: Facade — all config logic lives in src/core/config/ modules.
// Consumers import { loadConfig, validateConfig, loadDotEnvFile } from this file.

export { loadConfig } from './core/config/configOrchestrator.js';
export { validateConfig } from './core/config/configValidator.js';
export { loadDotEnvFile } from './core/config/dotEnvLoader.js';
