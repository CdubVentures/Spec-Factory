#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tools/specfactory-launcher.mjs
var import_node_http = __toESM(require("node:http"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_child_process2 = require("node:child_process");

// tools/setup-core.mjs
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_net = __toESM(require("node:net"), 1);
var import_node_child_process = require("node:child_process");
var IS_WINDOWS = process.platform === "win32";
function toolName(base) {
  if (!IS_WINDOWS) {
    return base;
  }
  if (base.endsWith(".cmd") || base.endsWith(".exe")) {
    return base;
  }
  return `${base}.cmd`;
}
function parseBool(value, fallback = false) {
  if (value === void 0 || value === null || value === "") {
    return fallback;
  }
  const token = String(value).trim().toLowerCase();
  return token === "1" || token === "true" || token === "yes" || token === "on";
}
function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}
function parseDotEnv(dotEnvPath) {
  if (!import_node_fs.default.existsSync(dotEnvPath)) {
    return {};
  }
  const out = {};
  const raw = import_node_fs.default.readFileSync(dotEnvPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const clean = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const index = clean.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = clean.slice(0, index).trim();
    let value = clean.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
function loadEnv(root) {
  return {
    ...parseDotEnv(import_node_path.default.join(root, ".env")),
    ...process.env
  };
}
function normalizeUrl(value, fallback = "") {
  const token = String(value || fallback || "").trim();
  if (!token) {
    return "";
  }
  return token.replace(/\/+$/, "");
}
function hostAndPort(urlString, fallbackPort) {
  const url = new URL(urlString);
  const host = String(url.hostname || "localhost");
  const port = Number.parseInt(url.port || "", 10) || fallbackPort;
  return { host, port };
}
function checkSocket(urlString, fallbackPort, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let host = "localhost";
    let port = fallbackPort;
    try {
      const parsed = hostAndPort(urlString, fallbackPort);
      host = parsed.host;
      port = parsed.port;
    } catch {
      resolve({
        ok: false,
        host,
        port,
        error: "invalid_url"
      });
      return;
    }
    const socket = new import_node_net.default.Socket();
    let settled = false;
    const finish = (payload) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(payload);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true, host, port }));
    socket.once("timeout", () => finish({ ok: false, host, port, error: "timeout" }));
    socket.once("error", (error) => {
      finish({
        ok: false,
        host,
        port,
        error: String(error?.code || error?.message || "connect_error")
      });
    });
    socket.connect(port, host);
  });
}
function commandExists(command) {
  return new Promise((resolve) => {
    let probe = null;
    try {
      probe = (0, import_node_child_process.spawn)(IS_WINDOWS ? "where" : "which", [command], {
        stdio: "ignore",
        shell: false
      });
    } catch {
      resolve(false);
      return;
    }
    probe.once("error", () => resolve(false));
    probe.once("close", (code) => resolve(code === 0));
  });
}
function runCommand(command, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    allowFailure = false,
    onLine = null,
    echo = false,
    shell = null
  } = options;
  const useShell = shell === null ? Boolean(IS_WINDOWS && /\.(cmd|bat)$/i.test(String(command || ""))) : Boolean(shell);
  return new Promise((resolve, reject) => {
    let child = null;
    try {
      child = (0, import_node_child_process.spawn)(command, args, {
        cwd,
        env,
        shell: useShell,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      if (allowFailure) {
        resolve({
          ok: false,
          code: 1,
          stdout: "",
          stderr: "",
          error: String(error?.message || error)
        });
        return;
      }
      reject(error);
      return;
    }
    let stdout = "";
    let stderr = "";
    let outCarry = "";
    let errCarry = "";
    const emitLines = (chunk, fromStdErr = false) => {
      const text = String(chunk || "");
      const lines = text.split(/\r?\n/);
      if (fromStdErr) {
        lines[0] = errCarry + lines[0];
      } else {
        lines[0] = outCarry + lines[0];
      }
      const last = lines.pop();
      for (const line of lines) {
        if (!line) {
          continue;
        }
        if (onLine) {
          onLine(line);
        }
        if (echo) {
          process.stdout.write(`${line}
`);
        }
      }
      if (fromStdErr) {
        errCarry = last || "";
      } else {
        outCarry = last || "";
      }
    };
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      emitLines(text, false);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      emitLines(text, true);
    });
    child.once("error", (error) => {
      if (allowFailure) {
        resolve({
          ok: false,
          code: 1,
          stdout,
          stderr,
          error: String(error?.message || error)
        });
        return;
      }
      reject(error);
    });
    child.once("close", (code) => {
      if (outCarry) {
        if (onLine) {
          onLine(outCarry);
        }
        if (echo) {
          process.stdout.write(`${outCarry}
`);
        }
      }
      if (errCarry) {
        if (onLine) {
          onLine(errCarry);
        }
        if (echo) {
          process.stdout.write(`${errCarry}
`);
        }
      }
      if (code === 0) {
        resolve({ ok: true, code: 0, stdout, stderr });
        return;
      }
      if (allowFailure) {
        resolve({
          ok: false,
          code: Number(code || 1),
          stdout,
          stderr,
          error: `exit_${code}`
        });
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with code ${code}`));
    });
  });
}
async function getCommandOutput(command, args = [], options = {}) {
  const result = await runCommand(command, args, {
    ...options,
    allowFailure: true
  });
  return {
    ok: result.ok,
    code: result.code,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    error: result.error || null
  };
}
function searxLikelyNeeded(envVars) {
  const provider = String(envVars.SEARCH_PROVIDER || "none").trim().toLowerCase();
  if (provider === "searxng") {
    return true;
  }
  return Boolean(envVars.SEARXNG_BASE_URL);
}
function candidateChatmockComposeFiles(envVars = {}) {
  const files = [];
  const composeFromEnv = String(envVars.CHATMOCK_COMPOSE_FILE || "").trim();
  if (composeFromEnv) {
    files.push(composeFromEnv);
  }
  const dirFromEnv = String(envVars.CHATMOCK_DIR || "").trim();
  if (dirFromEnv) {
    files.push(import_node_path.default.join(dirFromEnv, "docker-compose.yml"));
  }
  const profile = String(envVars.USERPROFILE || process.env.USERPROFILE || "").trim();
  if (profile) {
    files.push(import_node_path.default.join(profile, "Desktop", "ChatMock", "docker-compose.yml"));
    files.push(import_node_path.default.join(profile, "Desktop", "ChatMock - claude", "docker-compose.yml"));
  }
  return [...new Set(files)];
}
function resolveChatmockComposeFile(envVars = {}) {
  for (const filePath of candidateChatmockComposeFiles(envVars)) {
    if (filePath && import_node_fs.default.existsSync(filePath)) {
      return filePath;
    }
  }
  return "";
}
function inferEvalBenchHostPortFromCompose(composePath) {
  if (!composePath || !import_node_fs.default.existsSync(composePath)) {
    return null;
  }
  let text = "";
  try {
    text = import_node_fs.default.readFileSync(composePath, "utf8");
  } catch {
    return null;
  }
  const blockMatch = text.match(
    /^\s{2}eval-bench:\s*([\s\S]*?)(?=^\s{2}[A-Za-z0-9_-]+:\s*$|^volumes:|\Z)/m
  );
  if (!blockMatch) {
    return null;
  }
  const block = blockMatch[1];
  const mapping = block.match(/["']?(\d+)\s*:\s*4000["']?/);
  if (!mapping) {
    return null;
  }
  const hostPort = Number.parseInt(mapping[1], 10);
  return Number.isFinite(hostPort) ? hostPort : null;
}
function inferCortexAsyncBaseUrl(envVars = {}) {
  const fromEnv = normalizeUrl(envVars.CORTEX_ASYNC_BASE_URL, "");
  if (fromEnv) {
    return {
      url: fromEnv,
      source: "env",
      composeFile: ""
    };
  }
  const composeFile = resolveChatmockComposeFile(envVars);
  const hostPort = inferEvalBenchHostPortFromCompose(composeFile);
  if (!hostPort) {
    return {
      url: "",
      source: "",
      composeFile: composeFile || ""
    };
  }
  return {
    url: `http://localhost:${hostPort}/api`,
    source: "chatmock_compose",
    composeFile
  };
}
function buildServiceTargets(envVars = {}) {
  const targets = [];
  const llmEnabled = parseBool(envVars.LLM_ENABLED, false);
  const cortexEnabled = parseBool(envVars.CORTEX_ENABLED, false);
  const asyncEnabledExplicit = hasOwn(envVars, "CORTEX_ASYNC_ENABLED");
  const cortexAsyncEnabled = parseBool(envVars.CORTEX_ASYNC_ENABLED, false);
  const asyncDisabledExplicit = asyncEnabledExplicit && !cortexAsyncEnabled;
  const asyncUrlMeta = inferCortexAsyncBaseUrl(envVars);
  const asyncUrl = normalizeUrl(asyncUrlMeta.url, "");
  let asyncPort = 4e3;
  if (asyncUrl) {
    try {
      asyncPort = hostAndPort(asyncUrl, 4e3).port;
    } catch {
      asyncPort = 4e3;
    }
  }
  const asyncConfigured = !asyncDisabledExplicit && Boolean(asyncUrl) && (cortexAsyncEnabled || hasOwn(envVars, "CORTEX_ASYNC_BASE_URL") || asyncUrlMeta.source === "chatmock_compose");
  if (llmEnabled || cortexEnabled) {
    targets.push({
      id: "svc_llm_sync",
      category: "services",
      name: "LLM/Cortex Sync Endpoint",
      url: normalizeUrl(envVars.CORTEX_BASE_URL || envVars.LLM_BASE_URL, "http://localhost:5001/v1"),
      fallbackPort: 5001,
      required: true
    });
  }
  if (cortexEnabled && asyncConfigured) {
    targets.push({
      id: "svc_cortex_async",
      category: "services",
      name: "Cortex Async Endpoint (optional)",
      url: asyncUrl,
      fallbackPort: asyncPort,
      required: false,
      source: asyncUrlMeta.source || "default",
      compose_file: asyncUrlMeta.composeFile || ""
    });
  }
  if (searxLikelyNeeded(envVars)) {
    targets.push({
      id: "svc_searxng",
      category: "services",
      name: "SearXNG Endpoint",
      url: normalizeUrl(envVars.SEARXNG_BASE_URL, "http://127.0.0.1:8080"),
      fallbackPort: 8080,
      required: false
    });
  }
  return targets;
}
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function dockerDesktopCandidates() {
  const files = [];
  const programFiles = String(process.env.ProgramFiles || "C:\\Program Files").trim();
  const programFilesX86 = String(process.env["ProgramFiles(x86)"] || "").trim();
  files.push(import_node_path.default.join(programFiles, "Docker", "Docker", "Docker Desktop.exe"));
  if (programFilesX86) {
    files.push(import_node_path.default.join(programFilesX86, "Docker", "Docker", "Docker Desktop.exe"));
  }
  return [...new Set(files)];
}
async function tryStartDockerDesktop(onLine) {
  if (!IS_WINDOWS) {
    return false;
  }
  for (const candidate of dockerDesktopCandidates()) {
    if (!import_node_fs.default.existsSync(candidate)) {
      continue;
    }
    try {
      const child = (0, import_node_child_process.spawn)(candidate, [], {
        detached: true,
        stdio: "ignore"
      });
      child.unref();
      if (onLine) {
        onLine(`Attempted Docker Desktop launch: ${candidate}`);
      }
      return true;
    } catch {
    }
  }
  return false;
}
async function ensureDockerReady({ root, onLine = null } = {}) {
  const hasDocker = await commandExists("docker");
  if (!hasDocker) {
    if (onLine) {
      onLine("Docker CLI not found in PATH.");
    }
    return false;
  }
  const quick = await getCommandOutput("docker", ["info"], {
    cwd: root,
    shell: false
  });
  if (quick.ok) {
    return true;
  }
  if (onLine) {
    onLine("Docker daemon not ready. Trying to start Docker Desktop...");
  }
  const launched = await tryStartDockerDesktop(onLine);
  if (!launched) {
    if (onLine) {
      onLine("Could not auto-launch Docker Desktop.");
    }
    return false;
  }
  const deadline = Date.now() + 18e4;
  while (Date.now() < deadline) {
    const result = await getCommandOutput("docker", ["info"], {
      cwd: root,
      shell: false
    });
    if (result.ok) {
      if (onLine) {
        onLine("Docker daemon is ready.");
      }
      return true;
    }
    await sleep(3e3);
  }
  if (onLine) {
    onLine("Docker did not become ready within timeout.");
  }
  return false;
}
async function waitForService(url, fallbackPort, timeoutMs = 9e4) {
  const deadline = Date.now() + Math.max(1e3, Number(timeoutMs) || 9e4);
  while (Date.now() < deadline) {
    const probe = await checkSocket(url, fallbackPort);
    if (probe.ok) {
      return true;
    }
    await sleep(2e3);
  }
  return false;
}
function resolveCortexSyncEndpoint(envVars = {}) {
  const url = normalizeUrl(envVars.CORTEX_BASE_URL || envVars.LLM_BASE_URL, "http://localhost:5001/v1");
  let port = 5001;
  try {
    port = hostAndPort(url, 5001).port;
  } catch {
    port = 5001;
  }
  return { url, port };
}
function resolveChatmockUiUrl(envVars = {}) {
  const explicit = normalizeUrl(envVars.CHATMOCK_UI_URL, "");
  if (explicit) {
    return explicit;
  }
  const asyncMeta = inferCortexAsyncBaseUrl(envVars);
  const asyncUrl = normalizeUrl(asyncMeta.url, "");
  if (asyncUrl) {
    return asyncUrl.replace(/\/api$/i, "");
  }
  const sync = resolveCortexSyncEndpoint(envVars).url;
  if (sync) {
    return sync.replace(/\/v1$/i, "");
  }
  return "";
}
async function startChatmockEvalBenchStack({
  root,
  envVars = null,
  onLine = null,
  waitForReady = true
} = {}) {
  const env = envVars || loadEnv(root);
  const composePath = resolveChatmockComposeFile(env);
  if (!composePath) {
    throw new Error("ChatMock docker-compose.yml not found.");
  }
  const dockerReady = await ensureDockerReady({ root, onLine });
  if (!dockerReady) {
    throw new Error("Docker is not ready.");
  }
  const composeDir = import_node_path.default.dirname(composePath);
  if (onLine) {
    onLine(`Starting ChatMock stack via: ${composePath}`);
  }
  const up = await runCommand("docker", ["compose", "-f", composePath, "up", "-d"], {
    cwd: composeDir,
    allowFailure: true,
    onLine,
    shell: false
  });
  if (!up.ok) {
    throw new Error(`docker compose up failed (${up.error || up.code})`);
  }
  const sync = resolveCortexSyncEndpoint(env);
  const asyncMeta = inferCortexAsyncBaseUrl(env);
  const asyncUrl = normalizeUrl(asyncMeta.url, "");
  const asyncEnabled = parseBool(env.CORTEX_ASYNC_ENABLED, false) || hasOwn(env, "CORTEX_ASYNC_BASE_URL") || asyncMeta.source === "chatmock_compose";
  let asyncPort = 4e3;
  if (asyncUrl) {
    try {
      asyncPort = hostAndPort(asyncUrl, 4e3).port;
    } catch {
      asyncPort = 4e3;
    }
  }
  const readiness = {
    sync_url: sync.url,
    sync_ready: false,
    async_url: asyncEnabled ? asyncUrl : "",
    async_ready: false
  };
  if (waitForReady) {
    if (onLine) {
      onLine(`Waiting for ChatMock sync endpoint: ${sync.url}`);
    }
    readiness.sync_ready = await waitForService(sync.url, sync.port, 12e4);
    if (!readiness.sync_ready && onLine) {
      onLine("ChatMock sync endpoint did not become ready in time.");
    }
    if (asyncEnabled && asyncUrl) {
      if (onLine) {
        onLine(`Waiting for async endpoint: ${asyncUrl}`);
      }
      readiness.async_ready = await waitForService(asyncUrl, asyncPort, 12e4);
      if (!readiness.async_ready && onLine) {
        onLine("ChatMock async endpoint did not become ready in time.");
      }
    }
  }
  return {
    ok: true,
    compose_file: composePath,
    ...readiness
  };
}
async function maybeAutoStartChatmockStack({ root, envVars = {}, onLine = null } = {}) {
  const syncTarget = buildServiceTargets(envVars).find((row) => row.id === "svc_llm_sync");
  if (!syncTarget) {
    return { attempted: false, started: false };
  }
  const composePath = resolveChatmockComposeFile(envVars);
  if (!composePath) {
    return { attempted: false, started: false };
  }
  const before = await checkSocket(syncTarget.url, syncTarget.fallbackPort);
  if (before.ok) {
    return { attempted: false, started: false };
  }
  if (onLine) {
    onLine("LLM/Cortex sync endpoint is down. Attempting ChatMock stack start...");
  }
  try {
    const started = await startChatmockEvalBenchStack({
      root,
      envVars,
      onLine,
      waitForReady: true
    });
    return {
      attempted: true,
      started: Boolean(started.sync_ready)
    };
  } catch (error) {
    if (onLine) {
      onLine(`ChatMock stack start failed: ${error.message || error}`);
    }
    return { attempted: true, started: false };
  }
}
async function maybeAutoStartSearxng({ root, envVars = {}, onLine = null } = {}) {
  const target = buildServiceTargets(envVars).find((row) => row.id === "svc_searxng");
  if (!target) {
    return { attempted: false, started: false };
  }
  const before = await checkSocket(target.url, target.fallbackPort);
  if (before.ok) {
    return { attempted: false, started: false };
  }
  const composePath = import_node_path.default.join(root, "tools", "searxng", "docker-compose.yml");
  if (!import_node_fs.default.existsSync(composePath)) {
    if (onLine) {
      onLine("SearXNG compose file not found. Skipping auto-start.");
    }
    return { attempted: false, started: false };
  }
  if (onLine) {
    onLine("SearXNG endpoint is down. Attempting Docker auto-start...");
  }
  try {
    const started = await startSearxngStack({
      root,
      envVars,
      onLine,
      waitForReady: true
    });
    return { attempted: true, started: Boolean(started.ready) };
  } catch (error) {
    if (onLine) {
      onLine(`SearXNG auto-start failed: ${error.message || error}`);
    }
    return { attempted: true, started: false };
  }
}
async function startSearxngStack({
  root,
  envVars = null,
  onLine = null,
  waitForReady = true
} = {}) {
  const env = envVars || loadEnv(root);
  const target = buildServiceTargets(env).find((row) => row.id === "svc_searxng");
  if (!target) {
    throw new Error("SearXNG endpoint is not configured.");
  }
  const composePath = import_node_path.default.join(root, "tools", "searxng", "docker-compose.yml");
  if (!import_node_fs.default.existsSync(composePath)) {
    throw new Error("SearXNG compose file not found.");
  }
  const dockerReady = await ensureDockerReady({ root, onLine });
  if (!dockerReady) {
    throw new Error("Docker is not ready.");
  }
  if (onLine) {
    onLine(`Starting SearXNG stack via: ${composePath}`);
  }
  const up = await runCommand("docker", ["compose", "-f", composePath, "up", "-d"], {
    cwd: root,
    allowFailure: true,
    onLine,
    shell: false
  });
  if (!up.ok) {
    throw new Error(`SearXNG docker compose up failed (${up.error || up.code})`);
  }
  let ready = true;
  if (waitForReady) {
    if (onLine) {
      onLine(`Waiting for SearXNG endpoint: ${target.url}`);
    }
    ready = await waitForService(target.url, target.fallbackPort, 12e4);
    if (!ready && onLine) {
      onLine("SearXNG endpoint did not become ready in time.");
    }
  }
  return {
    ok: true,
    compose_file: composePath,
    url: target.url,
    ready
  };
}
function endpointActionForTarget({
  target,
  chatmockComposePath,
  envVars = {},
  reachable = false,
  allTargets = []
} = {}) {
  if (target.id === "svc_searxng") {
    if (reachable) {
      return {
        action_id: "open_searxng_ui",
        action_label: "Open SearXNG UI",
        action_kind: "launch"
      };
    }
    return {
      action_id: "start_searxng_stack",
      action_label: "Launch SearXNG",
      action_kind: "launch"
    };
  }
  if ((target.id === "svc_llm_sync" || target.id === "svc_cortex_async") && chatmockComposePath) {
    if (reachable) {
      const hasAsyncTarget = allTargets.some((row) => row.id === "svc_cortex_async");
      const exposeUiAction = target.id === "svc_cortex_async" || !hasAsyncTarget;
      if (exposeUiAction && resolveChatmockUiUrl(envVars)) {
        return {
          action_id: "open_chatmock_ui",
          action_label: "Open ChatMock UI",
          action_kind: "launch"
        };
      }
      return {
        action_id: "",
        action_label: "",
        action_kind: ""
      };
    }
    return {
      action_id: "start_chatmock_stack",
      action_label: "Launch ChatMock",
      action_kind: "launch"
    };
  }
  return {
    action_id: "",
    action_label: "",
    action_kind: ""
  };
}
function checkWithUiMeta(payload = {}) {
  return {
    installed_state: "unknown",
    running_state: "inactive",
    action_id: "",
    action_label: "",
    action_kind: "",
    ...payload
  };
}
function openUrlInBrowser(url) {
  if (!url) {
    throw new Error("URL is required.");
  }
  try {
    if (process.platform === "win32") {
      const child2 = (0, import_node_child_process.spawn)("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore"
      });
      child2.unref();
      return;
    }
    const command = process.platform === "darwin" ? "open" : "xdg-open";
    const child = (0, import_node_child_process.spawn)(command, [url], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  } catch (error) {
    throw new Error(`Failed to open URL: ${error?.message || error}`);
  }
}
async function runEndpointChecks({ envVars = {}, strictServices = false, onLine = null } = {}) {
  const targets = buildServiceTargets(envVars);
  const checks = [];
  const chatmockComposePath = resolveChatmockComposeFile(envVars);
  let requiredFailures = 0;
  const chatmockTargets = targets.filter(
    (target) => target.id === "svc_llm_sync" || target.id === "svc_cortex_async"
  );
  const otherTargets = targets.filter(
    (target) => target.id !== "svc_llm_sync" && target.id !== "svc_cortex_async"
  );
  for (const target of otherTargets) {
    const result = await checkSocket(target.url, target.fallbackPort);
    const action = endpointActionForTarget({
      target,
      chatmockComposePath,
      envVars,
      reachable: result.ok,
      allTargets: targets
    });
    if (result.ok) {
      const line2 = `[ok] ${target.name} -> ${result.host}:${result.port}`;
      if (onLine) {
        onLine(line2);
      }
      checks.push(checkWithUiMeta({
        ...target,
        status: "ok",
        reachable: true,
        details: `${result.host}:${result.port}`,
        installed_state: "installed",
        running_state: "running",
        ...action
      }));
      continue;
    }
    const strictFailure = target.required && strictServices;
    if (strictFailure) {
      requiredFailures += 1;
    }
    const level = strictFailure ? "error" : "warn";
    const line = `[${level}] ${target.name} not reachable (${result.host}:${result.port}, ${result.error})`;
    if (onLine) {
      onLine(line);
    }
    checks.push(checkWithUiMeta({
      ...target,
      status: strictFailure ? "missing" : "warn",
      reachable: false,
      details: `${result.host}:${result.port} (${result.error})`,
      installed_state: "installed",
      running_state: "inactive",
      ...action
    }));
  }
  if (chatmockTargets.length > 0) {
    const syncTarget = chatmockTargets.find((target) => target.id === "svc_llm_sync") || null;
    const asyncTarget = chatmockTargets.find((target) => target.id === "svc_cortex_async") || null;
    let syncResult = null;
    if (syncTarget) {
      syncResult = await checkSocket(syncTarget.url, syncTarget.fallbackPort);
      const level = syncResult.ok ? "ok" : strictServices && syncTarget.required ? "error" : "warn";
      if (onLine) {
        onLine(`[${level}] ${syncTarget.name} ${syncResult.ok ? "->" : "not reachable ("}${syncResult.host}:${syncResult.port}${syncResult.ok ? "" : `, ${syncResult.error})`}`);
      }
    }
    let asyncResult = null;
    if (asyncTarget) {
      asyncResult = await checkSocket(asyncTarget.url, asyncTarget.fallbackPort);
      if (onLine) {
        const level = asyncResult.ok ? "ok" : "warn";
        onLine(`[${level}] ${asyncTarget.name} ${asyncResult.ok ? "->" : "not reachable ("}${asyncResult.host}:${asyncResult.port}${asyncResult.ok ? "" : `, ${asyncResult.error})`}`);
      }
    }
    const syncReady = Boolean(syncResult?.ok);
    const asyncReady = Boolean(asyncResult?.ok);
    const requiredReady = syncTarget ? syncReady : asyncReady;
    const syncStrictFailure = Boolean(syncTarget && !syncReady && strictServices && syncTarget.required);
    if (syncStrictFailure) {
      requiredFailures += 1;
    }
    const detailParts = [];
    if (syncTarget && syncResult) {
      detailParts.push(`sync ${syncResult.host}:${syncResult.port} (${syncResult.ok ? "up" : syncResult.error || "down"})`);
    }
    if (asyncTarget && asyncResult) {
      const asyncState = asyncResult.ok ? "up" : `${asyncResult.error || "down"}, optional`;
      detailParts.push(`async ${asyncResult.host}:${asyncResult.port} (${asyncState})`);
    }
    if (chatmockComposePath) {
      detailParts.push(`compose ${chatmockComposePath}`);
    } else if (!requiredReady) {
      detailParts.push("compose not found (set CHATMOCK_COMPOSE_FILE for one-click launch)");
    }
    let action = {
      action_id: "",
      action_label: "",
      action_kind: ""
    };
    if (requiredReady) {
      const chatmockUiUrl = resolveChatmockUiUrl(envVars);
      if (chatmockUiUrl) {
        action = {
          action_id: "open_chatmock_ui",
          action_label: "Open ChatMock UI",
          action_kind: "launch"
        };
      }
    } else if (chatmockComposePath) {
      action = {
        action_id: "start_chatmock_stack",
        action_label: "Launch ChatMock",
        action_kind: "launch"
      };
    }
    checks.push(checkWithUiMeta({
      id: "svc_chatmock",
      category: "services",
      name: "ChatMock Endpoint",
      required: Boolean(syncTarget?.required),
      status: requiredReady ? "ok" : syncStrictFailure ? "missing" : "warn",
      reachable: requiredReady,
      details: detailParts.join(" | "),
      installed_state: requiredReady || chatmockComposePath ? "installed" : "missing",
      running_state: requiredReady ? "running" : "inactive",
      ...action
    }));
  }
  return {
    checks,
    requiredFailures
  };
}
async function detectPythonCommand() {
  if (await commandExists("python")) {
    return "python";
  }
  if (await commandExists("py")) {
    return "py";
  }
  return "";
}
function localPlaywrightInstalled(root) {
  const browserRoot = import_node_path.default.join(root, "node_modules", "playwright-core", ".local-browsers");
  if (!import_node_fs.default.existsSync(browserRoot)) {
    return false;
  }
  try {
    return import_node_fs.default.readdirSync(browserRoot).some((name) => name.startsWith("chromium-"));
  } catch {
    return false;
  }
}
async function checkPythonModule(pythonCommand, moduleName, root) {
  if (!pythonCommand) {
    return {
      installed: false,
      version: null
    };
  }
  const script = [
    "import importlib.util, importlib.metadata, json",
    `name = ${JSON.stringify(moduleName)}`,
    "spec = importlib.util.find_spec(name)",
    "version = None",
    "if spec is not None:",
    "  try:",
    "    version = importlib.metadata.version(name)",
    "  except Exception:",
    "    version = None",
    'print(json.dumps({"installed": bool(spec), "version": version}))'
  ].join("\n");
  const out = await getCommandOutput(pythonCommand, ["-c", script], { cwd: root });
  if (!out.ok || !out.stdout) {
    return {
      installed: false,
      version: null
    };
  }
  try {
    const parsed = JSON.parse(out.stdout);
    return {
      installed: Boolean(parsed.installed),
      version: parsed.version || null
    };
  } catch {
    return {
      installed: false,
      version: null
    };
  }
}
function summarizeChecks(checks = []) {
  const total = checks.length;
  const ok = checks.filter((row) => row.status === "ok").length;
  const warn = checks.filter((row) => row.status === "warn").length;
  const missingRequired = checks.filter((row) => row.required && row.status !== "ok").length;
  const missingOptional = checks.filter((row) => !row.required && row.status !== "ok").length;
  return {
    total,
    ok,
    warn,
    missing_required: missingRequired,
    missing_optional: missingOptional
  };
}
function setupReadyForLaunch(checks = []) {
  const requiredFailures = checks.some((row) => row.required && row.status !== "ok");
  return !requiredFailures;
}
async function collectSetupStatus({ root, envVars = null } = {}) {
  const env = envVars || loadEnv(root);
  const checks = [];
  const serviceTargets = buildServiceTargets(env);
  const chatmockCompose = resolveChatmockComposeFile(env);
  const nodeVersion = process.version ? {
    ok: true,
    stdout: process.version
  } : await getCommandOutput("node", ["-v"], { cwd: root });
  checks.push(checkWithUiMeta({
    id: "node_runtime",
    category: "core",
    name: "SpecFactory Runtime (Node.js)",
    status: nodeVersion.ok ? "ok" : "warn",
    required: true,
    details: nodeVersion.ok ? `active (${nodeVersion.stdout})` : "inactive (Node.js not found in PATH)",
    installed_state: nodeVersion.ok ? "installed" : "missing",
    running_state: nodeVersion.ok ? "running" : "inactive",
    action_id: nodeVersion.ok ? "" : "install_node_lts",
    action_label: nodeVersion.ok ? "" : "Install Node LTS",
    action_kind: nodeVersion.ok ? "" : "fix"
  }));
  if (serviceTargets.some((row) => row.id === "svc_searxng")) {
    const dockerCli = await commandExists("docker");
    checks.push(checkWithUiMeta({
      id: "docker_cli",
      category: "services",
      name: "Docker CLI",
      status: dockerCli ? "ok" : "warn",
      required: false,
      details: dockerCli ? "docker command available" : "docker not found in PATH",
      installed_state: dockerCli ? "installed" : "missing",
      running_state: dockerCli ? "running" : "inactive",
      action_id: dockerCli ? "" : "install_docker_desktop",
      action_label: dockerCli ? "" : "Install Docker Desktop",
      action_kind: dockerCli ? "" : "fix"
    }));
    if (dockerCli) {
      const dockerInfo = await getCommandOutput("docker", ["info"], {
        cwd: root,
        shell: false
      });
      checks.push(checkWithUiMeta({
        id: "docker_daemon",
        category: "services",
        name: "Docker Daemon",
        status: dockerInfo.ok ? "ok" : "warn",
        required: false,
        details: dockerInfo.ok ? "running" : "inactive (start Docker Desktop)",
        installed_state: "installed",
        running_state: dockerInfo.ok ? "running" : "inactive",
        action_id: dockerInfo.ok ? "" : "start_docker_desktop",
        action_label: dockerInfo.ok ? "" : "Launch Docker",
        action_kind: dockerInfo.ok ? "" : "launch"
      }));
    }
  }
  const npmCommand = toolName("npm");
  const npmVersion = await getCommandOutput(npmCommand, ["-v"], { cwd: root });
  checks.push(checkWithUiMeta({
    id: "npm_cli",
    category: "core",
    name: "npm CLI",
    status: npmVersion.ok ? "ok" : "warn",
    required: true,
    details: npmVersion.ok ? npmVersion.stdout : "inactive (npm not found)",
    installed_state: npmVersion.ok ? "installed" : "missing",
    running_state: npmVersion.ok ? "running" : "inactive",
    action_id: npmVersion.ok ? "" : "install_node_lts",
    action_label: npmVersion.ok ? "" : "Install Node LTS",
    action_kind: npmVersion.ok ? "" : "fix"
  }));
  const npxCommand = toolName("npx");
  const npxVersion = await getCommandOutput(npxCommand, ["-v"], { cwd: root });
  checks.push(checkWithUiMeta({
    id: "npx_cli",
    category: "core",
    name: "npx CLI",
    status: npxVersion.ok ? "ok" : "warn",
    required: true,
    details: npxVersion.ok ? npxVersion.stdout : "inactive (npx not found)",
    installed_state: npxVersion.ok ? "installed" : "missing",
    running_state: npxVersion.ok ? "running" : "inactive",
    action_id: npxVersion.ok ? "" : "install_node_lts",
    action_label: npxVersion.ok ? "" : "Install Node LTS",
    action_kind: npxVersion.ok ? "" : "fix"
  }));
  const hasNodeModules = import_node_fs.default.existsSync(import_node_path.default.join(root, "node_modules"));
  checks.push(checkWithUiMeta({
    id: "node_modules",
    category: "core",
    name: "Node Modules Installed",
    status: hasNodeModules ? "ok" : "missing",
    required: true,
    details: hasNodeModules ? "node_modules present" : "npm install required",
    installed_state: hasNodeModules ? "installed" : "missing",
    running_state: hasNodeModules ? "running" : "inactive",
    action_id: hasNodeModules ? "" : "install_npm_packages",
    action_label: hasNodeModules ? "" : "Install npm packages",
    action_kind: hasNodeModules ? "" : "fix"
  }));
  const playwrightInstalled = localPlaywrightInstalled(root);
  checks.push(checkWithUiMeta({
    id: "playwright_browser",
    category: "core",
    name: "Playwright Chromium",
    status: playwrightInstalled ? "ok" : "missing",
    required: true,
    details: playwrightInstalled ? "local browser binary found" : "playwright chromium not installed",
    installed_state: playwrightInstalled ? "installed" : "missing",
    running_state: playwrightInstalled ? "running" : "inactive",
    action_id: playwrightInstalled ? "" : "install_playwright_chromium",
    action_label: playwrightInstalled ? "" : "Install Playwright",
    action_kind: playwrightInstalled ? "" : "fix"
  }));
  const pythonCommand = await detectPythonCommand();
  let pythonVersion = null;
  if (pythonCommand) {
    const version = await getCommandOutput(pythonCommand, ["--version"], { cwd: root });
    pythonVersion = version.ok ? version.stdout : null;
  }
  checks.push(checkWithUiMeta({
    id: "python_runtime",
    category: "python",
    name: "Python Runtime",
    status: pythonCommand ? "ok" : "warn",
    required: true,
    details: pythonCommand ? `${pythonCommand} (${pythonVersion || "available"})` : "inactive (python not found in PATH)",
    installed_state: pythonCommand ? "installed" : "missing",
    running_state: pythonCommand ? "running" : "inactive",
    action_id: pythonCommand ? "" : "install_python_runtime",
    action_label: pythonCommand ? "" : "Install Python 3",
    action_kind: pythonCommand ? "" : "fix"
  }));
  const pdfplumber = await checkPythonModule(pythonCommand, "pdfplumber", root);
  checks.push(checkWithUiMeta({
    id: "python_pdfplumber",
    category: "python",
    name: "Python: pdfplumber",
    status: pdfplumber.installed ? "ok" : "missing",
    required: true,
    details: pdfplumber.installed ? `v${pdfplumber.version || "installed"}` : "not installed",
    installed_state: pdfplumber.installed ? "installed" : "missing",
    running_state: pdfplumber.installed ? "running" : "inactive",
    action_id: pdfplumber.installed ? "" : "install_python_pdfplumber",
    action_label: pdfplumber.installed ? "" : "Install pdfplumber",
    action_kind: pdfplumber.installed ? "" : "fix"
  }));
  const requests = await checkPythonModule(pythonCommand, "requests", root);
  checks.push(checkWithUiMeta({
    id: "python_requests",
    category: "python",
    name: "Python: requests",
    status: requests.installed ? "ok" : "missing",
    required: true,
    details: requests.installed ? `v${requests.version || "installed"}` : "not installed",
    installed_state: requests.installed ? "installed" : "missing",
    running_state: requests.installed ? "running" : "inactive",
    action_id: requests.installed ? "" : "install_python_requests",
    action_label: requests.installed ? "" : "Install requests",
    action_kind: requests.installed ? "" : "fix"
  }));
  const endpoints = await runEndpointChecks({
    envVars: env,
    strictServices: false
  });
  checks.push(...endpoints.checks);
  const specFactoryExePath = import_node_path.default.join(root, "SpecFactory.exe");
  const specFactoryExeExists = import_node_fs.default.existsSync(specFactoryExePath);
  const readyForLaunch = setupReadyForLaunch(checks);
  checks.push(checkWithUiMeta({
    id: "specfactory_app",
    category: "application",
    name: "SpecFactory App",
    status: specFactoryExeExists ? "ok" : "warn",
    required: false,
    details: specFactoryExeExists ? `found at ${specFactoryExePath}` : `missing (${specFactoryExePath})`,
    installed_state: specFactoryExeExists ? "installed" : "missing",
    running_state: "inactive",
    action_id: specFactoryExeExists ? "launch_specfactory_exe" : "",
    action_label: specFactoryExeExists ? "Launch SpecFactory" : "",
    action_kind: specFactoryExeExists ? "launch" : "",
    action_requires_ready: specFactoryExeExists ? true : false,
    ready_for_launch: readyForLaunch
  }));
  return {
    generated_at: (/* @__PURE__ */ new Date()).toISOString(),
    checks,
    summary: summarizeChecks(checks)
  };
}
async function installViaWinget({ root, packageId, packageLabel, onLine = null } = {}) {
  if (!IS_WINDOWS) {
    throw new Error(`${packageLabel || packageId} auto-install is supported on Windows only.`);
  }
  const hasWinget = await commandExists("winget");
  if (!hasWinget) {
    throw new Error("winget was not found in PATH.");
  }
  if (onLine) {
    onLine(`Installing ${packageLabel || packageId} via winget...`);
  }
  const install = await runCommand(
    "winget",
    [
      "install",
      "--id",
      packageId,
      "--exact",
      "--accept-package-agreements",
      "--accept-source-agreements"
    ],
    {
      cwd: root,
      allowFailure: true,
      onLine,
      shell: false
    }
  );
  if (!install.ok) {
    throw new Error(`winget install failed (${install.error || install.code})`);
  }
  return {
    ok: true,
    package_id: packageId,
    restart_required: true
  };
}
async function installPythonModule({ root, moduleName, onLine = null } = {}) {
  const python = await detectPythonCommand();
  if (!python) {
    throw new Error("Python runtime is not available in PATH.");
  }
  await runCommand(python, ["-m", "pip", "install", moduleName], {
    cwd: root,
    onLine
  });
  return { ok: true, module: moduleName };
}
async function runSetupAction({
  root,
  actionId,
  envVars = null,
  onLine = null
} = {}) {
  if (!actionId) {
    throw new Error("actionId is required.");
  }
  const env = envVars || loadEnv(root);
  const npm = toolName("npm");
  const npx = toolName("npx");
  if (actionId === "install_node_lts") {
    return installViaWinget({
      root,
      packageId: "OpenJS.NodeJS.LTS",
      packageLabel: "Node.js LTS",
      onLine
    });
  }
  if (actionId === "install_python_runtime") {
    return installViaWinget({
      root,
      packageId: "Python.Python.3.12",
      packageLabel: "Python 3.12",
      onLine
    });
  }
  if (actionId === "install_docker_desktop") {
    return installViaWinget({
      root,
      packageId: "Docker.DockerDesktop",
      packageLabel: "Docker Desktop",
      onLine
    });
  }
  if (actionId === "start_docker_desktop") {
    const ready = await ensureDockerReady({ root, onLine });
    if (!ready) {
      throw new Error("Docker is not ready.");
    }
    return { ok: true, ready: true };
  }
  if (actionId === "install_npm_packages") {
    const hasNpm = await commandExists(npm);
    if (!hasNpm) {
      throw new Error("npm is not available. Install Node.js first.");
    }
    await runCommand(npm, ["install"], {
      cwd: root,
      onLine
    });
    return { ok: true };
  }
  if (actionId === "install_playwright_chromium") {
    const hasNpx = await commandExists(npx);
    if (!hasNpx) {
      throw new Error("npx is not available. Install Node.js first.");
    }
    await runCommand(npx, ["playwright", "install", "chromium"], {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: "0"
      },
      onLine
    });
    return { ok: true };
  }
  if (actionId === "install_python_pdfplumber") {
    return installPythonModule({ root, moduleName: "pdfplumber", onLine });
  }
  if (actionId === "install_python_requests") {
    return installPythonModule({ root, moduleName: "requests", onLine });
  }
  if (actionId === "start_chatmock_stack") {
    return startChatmockEvalBenchStack({
      root,
      envVars: env,
      onLine,
      waitForReady: true
    });
  }
  if (actionId === "start_searxng_stack") {
    return startSearxngStack({
      root,
      envVars: env,
      onLine,
      waitForReady: true
    });
  }
  if (actionId === "open_chatmock_ui") {
    const url = resolveChatmockUiUrl(env);
    if (!url) {
      throw new Error("ChatMock UI URL is not configured.");
    }
    openUrlInBrowser(url);
    if (onLine) {
      onLine(`Opened ChatMock UI: ${url}`);
    }
    return {
      ok: true,
      opened: true,
      url
    };
  }
  if (actionId === "open_searxng_ui") {
    const url = normalizeUrl(env.SEARXNG_BASE_URL, "http://127.0.0.1:8080");
    openUrlInBrowser(url);
    if (onLine) {
      onLine(`Opened SearXNG UI: ${url}`);
    }
    return {
      ok: true,
      opened: true,
      url
    };
  }
  if (actionId === "launch_specfactory_exe") {
    const status = await collectSetupStatus({ root, envVars: env });
    if (!setupReadyForLaunch(status.checks)) {
      throw new Error("Setup not ready. Resolve required checks before launching SpecFactory.");
    }
    const exePath = import_node_path.default.join(root, "SpecFactory.exe");
    if (!import_node_fs.default.existsSync(exePath)) {
      throw new Error("SpecFactory.exe not found in project root.");
    }
    try {
      const child = (0, import_node_child_process.spawn)(exePath, [], {
        cwd: root,
        detached: true,
        stdio: "ignore",
        shell: false
      });
      child.unref();
    } catch (error) {
      throw new Error(`Failed to launch SpecFactory.exe (${error?.message || error})`);
    }
    return {
      ok: true,
      launched: true,
      path: exePath
    };
  }
  throw new Error(`Unknown setup action: ${actionId}`);
}
async function installDependencies({
  root,
  strictServices = false,
  onLine = null
} = {}) {
  const log = (line) => {
    if (onLine) {
      onLine(String(line));
    }
  };
  const npm = toolName("npm");
  const npx = toolName("npx");
  const hasNpm = await commandExists(npm);
  const hasNpx = await commandExists(npx);
  if (!hasNpm || !hasNpx) {
    throw new Error("Node.js + npm are required. Install Node 20+ and retry.");
  }
  log("=== Step 1/5 - npm install ===");
  await runCommand(npm, ["install"], {
    cwd: root,
    onLine: log
  });
  log("=== Step 2/5 - Playwright browser install ===");
  await runCommand(npx, ["playwright", "install", "chromium"], {
    cwd: root,
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: "0"
    },
    onLine: log
  });
  log("=== Step 3/5 - Python dependencies ===");
  const python = await detectPythonCommand();
  if (!python) {
    log("Python not found in PATH. Skipping pip install.");
  } else if (!import_node_fs.default.existsSync(import_node_path.default.join(root, "requirements.txt"))) {
    log("requirements.txt not found. Skipping pip install.");
  } else {
    await runCommand(python, ["-m", "pip", "install", "-r", "requirements.txt"], {
      cwd: root,
      onLine: log
    });
  }
  const env = loadEnv(root);
  log("=== Step 4/5 - Auto-start docker services ===");
  await maybeAutoStartChatmockStack({
    root,
    envVars: env,
    onLine: log
  });
  await maybeAutoStartSearxng({
    root,
    envVars: env,
    onLine: log
  });
  log("=== Step 5/5 - Service endpoint checks ===");
  const endpointResult = await runEndpointChecks({
    envVars: env,
    strictServices,
    onLine: log
  });
  if (strictServices && endpointResult.requiredFailures > 0) {
    throw new Error("Strict service checks failed. Start required endpoints and retry.");
  }
  return {
    ok: true,
    strict_services: strictServices,
    endpoint_required_failures: endpointResult.requiredFailures
  };
}

// tools/specfactory-launcher.mjs
var scriptPath = import_node_path2.default.resolve(process.argv[1] || import_node_path2.default.join(process.cwd(), "tools", "specfactory-launcher.mjs"));
var scriptDir = import_node_path2.default.dirname(scriptPath);
var ROOT = typeof process.pkg !== "undefined" ? import_node_path2.default.dirname(process.execPath) : import_node_path2.default.resolve(scriptDir, "..");
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}
function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}
function sendHtml(res, body) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2e6) {
        reject(new Error("payload_too_large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error(`invalid_json: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}
function openBrowser(url, noOpen = false) {
  if (noOpen) {
    return;
  }
  try {
    if (process.platform === "win32") {
      const child2 = (0, import_node_child_process2.spawn)("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
      child2.unref();
      return;
    }
    if (process.platform === "darwin") {
      const child2 = (0, import_node_child_process2.spawn)("open", [url], { detached: true, stdio: "ignore" });
      child2.unref();
      return;
    }
    const child = (0, import_node_child_process2.spawn)("xdg-open", [url], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
  }
}
function buildHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SpecFactory Launcher</title>
  <style>
    :root{
      --surface-0:#f1f6fb;
      --surface-1:#ffffff;
      --surface-2:#f8fbff;
      --surface-3:#eef4fb;
      --ink:#0d2238;
      --muted:#4d667f;
      --line:#d7e2ef;
      --line-strong:#c0d0e2;
      --ok:#14955a;
      --warn:#bb7608;
      --bad:#c64242;
      --accent:#2f6fb8;
      --accent-ink:#e8f3ff;
      --shadow:0 22px 44px rgba(7,20,34,.18);
      --bg-image-opacity:.44;
      --bg-overlay:linear-gradient(160deg, rgba(7,17,28,.60), rgba(7,20,36,.38));
      --hero-ink:#f2f8ff;
      --hero-muted:#cddcf1;
      --tech-bg-image:url('https://images.unsplash.com/photo-1689443111384-1cf214df988a?auto=format&fit=crop&fm=jpg&q=80&w=2400');
      --log-bg:#081424;
      --log-line:#20344c;
      --log-ink:#d5e7ff;
    }
    :root[data-theme="dark"]{
      --surface-0:#050d16;
      --surface-1:#0d1b2b;
      --surface-2:#132336;
      --surface-3:#0f2135;
      --ink:#e6f1ff;
      --muted:#9db2cb;
      --line:#20384f;
      --line-strong:#2b4a66;
      --ok:#2ecb86;
      --warn:#f0ba57;
      --bad:#f06f6f;
      --accent:#4aa3f7;
      --accent-ink:#03111f;
      --shadow:0 26px 56px rgba(0,0,0,.46);
      --bg-image-opacity:.70;
      --bg-overlay:linear-gradient(156deg, rgba(3,8,14,.88), rgba(6,14,24,.74));
      --hero-ink:#f0f7ff;
      --hero-muted:#a8bdd7;
      --log-bg:#060f1a;
      --log-line:#28435d;
      --log-ink:#e0efff;
    }
    *{box-sizing:border-box}
    html,body{height:100%}
    body{
      margin:0;
      min-height:100vh;
      padding:18px;
      color:var(--ink);
      font-family:"Segoe UI Variable Display","Segoe UI","Avenir Next","Trebuchet MS",sans-serif;
      background:var(--surface-0);
      position:relative;
      overflow-x:hidden;
    }
    body::before{
      content:"";
      position:fixed;
      inset:0;
      z-index:-2;
      background-image:var(--bg-overlay), var(--tech-bg-image);
      background-size:cover;
      background-position:center;
      background-repeat:no-repeat;
      opacity:var(--bg-image-opacity);
      transform:scale(1.03);
    }
    body::after{
      content:"";
      position:fixed;
      inset:0;
      z-index:-1;
      pointer-events:none;
      background:
        radial-gradient(980px 400px at 16% -12%, rgba(93,169,255,.22), rgba(93,169,255,0) 68%),
        radial-gradient(840px 360px at 86% -12%, rgba(255,192,124,.12), rgba(255,192,124,0) 70%);
    }
    .shell{max-width:1280px;margin:0 auto;display:grid;gap:14px}
    .hero{
      display:flex;
      justify-content:space-between;
      align-items:center;
      flex-wrap:wrap;
      gap:10px;
      color:var(--hero-ink);
      border:1px solid color-mix(in srgb, var(--line-strong) 68%, transparent);
      border-radius:16px;
      padding:14px 16px;
      background:color-mix(in srgb, var(--surface-1) 70%, transparent);
      box-shadow:var(--shadow);
      backdrop-filter:blur(6px);
    }
    .hero h1{margin:0;font-size:30px;letter-spacing:.2px}
    .hero p{margin:4px 0 0;color:var(--hero-muted);font-size:14px}
    .state{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:8px 12px;
      border-radius:999px;
      border:1px solid color-mix(in srgb, var(--line) 76%, transparent);
      background:color-mix(in srgb, var(--surface-2) 70%, transparent);
      font-size:13px;
    }
    .dot{width:8px;height:8px;border-radius:50%;background:#91a5bb}
    .dot.run{background:#41a7ef;animation:pulse 1.1s infinite}
    .dot.ok{background:var(--ok)}
    .dot.err{background:var(--bad)}
    .panel{
      background:var(--surface-1);
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px;
      box-shadow:var(--shadow);
      backdrop-filter:blur(4px);
    }
    .row{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
    .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .toggle{display:inline-flex;gap:7px;align-items:center;font-size:13px;color:var(--muted)}
    .btn{
      border:1px solid transparent;
      border-radius:9px;
      padding:9px 12px;
      cursor:pointer;
      font-weight:700;
      color:var(--accent-ink);
      background:linear-gradient(140deg,var(--accent), color-mix(in srgb, var(--accent) 78%, #0b3e70));
      box-shadow:0 8px 18px rgba(17,55,93,.24);
    }
    .btn.alt{
      background:var(--surface-2);
      border-color:var(--line-strong);
      color:var(--ink);
      box-shadow:none;
    }
    .btn:hover{filter:brightness(1.05)}
    .btn:disabled{opacity:.55;cursor:not-allowed}
    .summary{
      margin-top:12px;
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(155px,1fr));
      gap:8px;
    }
    .summary .item{
      border:1px solid var(--line);
      border-radius:11px;
      padding:8px 10px;
      background:var(--surface-2);
    }
    .summary .k{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.7px}
    .summary .v{margin-top:2px;font-size:22px;font-weight:800}
    .alerts{
      margin-top:10px;
      border:1px dashed var(--line-strong);
      border-radius:11px;
      background:var(--surface-2);
      min-height:46px;
      padding:10px 12px;
      font-size:13px;
      color:var(--muted);
    }
    .alerts .empty{color:var(--ok);font-weight:700}
    .table-wrap{
      margin-top:12px;
      overflow:auto;
      border:1px solid var(--line);
      border-radius:12px;
      background:var(--surface-1);
    }
    table{width:100%;border-collapse:collapse;min-width:980px}
    thead th{
      position:sticky;
      top:0;
      z-index:2;
      background:var(--surface-3);
      color:var(--muted);
      border-bottom:1px solid var(--line);
      font-size:12px;
      letter-spacing:.5px;
      text-transform:uppercase;
      text-align:left;
      padding:10px;
    }
    tbody td{border-bottom:1px solid var(--line);vertical-align:top;padding:9px 10px;font-size:13px}
    tbody tr:hover{background:color-mix(in srgb, var(--surface-3) 72%, transparent)}
    tbody tr.updating{background:color-mix(in srgb, var(--accent) 18%, var(--surface-1))}
    .name{font-weight:700;line-height:1.35}
    .meta{margin-top:3px;color:var(--muted);font-size:11px}
    .chip{
      display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;
      text-transform:uppercase;letter-spacing:.45px;border:1px solid transparent
    }
    .chip.ok{background:color-mix(in srgb, var(--ok) 15%, transparent);color:var(--ok);border-color:color-mix(in srgb, var(--ok) 52%, transparent)}
    .chip.warn{background:color-mix(in srgb, var(--warn) 16%, transparent);color:var(--warn);border-color:color-mix(in srgb, var(--warn) 52%, transparent)}
    .chip.bad{background:color-mix(in srgb, var(--bad) 14%, transparent);color:var(--bad);border-color:color-mix(in srgb, var(--bad) 52%, transparent)}
    .chip.live{background:color-mix(in srgb, var(--accent) 18%, transparent);color:var(--accent);border-color:color-mix(in srgb, var(--accent) 52%, transparent)}
    .chip.idle{background:color-mix(in srgb, var(--line) 38%, transparent);color:var(--muted);border-color:var(--line-strong)}
    .mini-btn{
      border:1px solid var(--line-strong);
      border-radius:8px;
      background:var(--surface-2);
      color:var(--ink);
      font-size:12px;
      font-weight:700;
      padding:7px 10px;
      cursor:pointer;
      white-space:nowrap;
    }
    .mini-btn:disabled{opacity:.55;cursor:not-allowed}
    .muted{color:var(--muted);font-size:12px;line-height:1.4}
    .settings-wrap{margin-top:10px}
    .settings-card{
      border:1px solid var(--line);
      border-radius:12px;
      padding:11px;
      background:var(--surface-2);
    }
    .settings-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:9px;
    }
    .settings-grid{
      display:grid;
      grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
      gap:10px;
    }
    .settings-item{
      border:1px solid var(--line);
      border-radius:10px;
      padding:9px;
      background:var(--surface-1);
      display:grid;
      gap:7px;
    }
    .field-label{
      font-size:11px;
      letter-spacing:.5px;
      text-transform:uppercase;
      color:var(--muted);
      font-weight:700;
    }
    .field-note{
      font-size:11px;
      color:var(--muted);
      font-style:italic;
    }
    .select{
      width:100%;
      border:1px solid var(--line-strong);
      border-radius:9px;
      padding:8px 10px;
      background:var(--surface-1);
      color:var(--ink);
      font:13px/1.35 "Segoe UI","Avenir Next",sans-serif;
    }
    .dep-title{
      display:flex;
      align-items:center;
      gap:6px;
    }
    .tip{
      width:18px;
      height:18px;
      border-radius:50%;
      border:1px solid color-mix(in srgb, var(--accent) 55%, var(--line-strong));
      background:linear-gradient(160deg, color-mix(in srgb, var(--accent) 18%, var(--surface-2)), var(--surface-2));
      color:var(--ink);
      display:inline-flex;
      align-items:center;
      justify-content:center;
      font-size:11px;
      font-weight:700;
      cursor:help;
      user-select:none;
      line-height:1;
      box-shadow:0 3px 8px rgba(6,17,31,.15);
      transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      outline:none;
    }
    .tip:hover,
    .tip:focus-visible{
      border-color:var(--accent);
      transform:translateY(-1px);
      box-shadow:0 7px 14px rgba(6,17,31,.24);
    }
    .toggle .tip{
      margin-left:2px;
      flex:0 0 auto;
    }
    .floating-tip{
      position:fixed;
      left:0;
      top:0;
      max-width:min(440px, calc(100vw - 16px));
      pointer-events:none;
      z-index:9999;
      opacity:0;
      transform:translateY(4px) scale(.985);
      transition:opacity .08s ease, transform .08s ease;
    }
    .floating-tip.show{
      opacity:1;
      transform:translateY(0) scale(1);
    }
    .floating-tip-card{
      border-radius:12px;
      border:1px solid color-mix(in srgb, var(--accent) 45%, var(--line-strong));
      background:color-mix(in srgb, var(--surface-1) 92%, #000);
      box-shadow:0 18px 34px rgba(2,8,16,.35);
      padding:10px 11px;
      color:var(--ink);
      backdrop-filter:blur(6px);
    }
    .floating-tip-title{
      font-size:12px;
      font-weight:800;
      letter-spacing:.2px;
      margin-bottom:7px;
      color:var(--ink);
    }
    .floating-tip-grid{
      display:grid;
      gap:6px;
    }
    .floating-tip-row{
      display:grid;
      grid-template-columns:58px 1fr;
      gap:8px;
      align-items:start;
    }
    .floating-tip-k{
      font-size:10px;
      text-transform:uppercase;
      letter-spacing:.6px;
      color:var(--muted);
      font-weight:800;
      line-height:1.35;
    }
    .floating-tip-v{
      font-size:11px;
      line-height:1.4;
      color:var(--ink);
      font-weight:600;
      white-space:pre-wrap;
    }
    .logbox{
      margin-top:12px;
      min-height:230px;
      max-height:360px;
      overflow:auto;
      border:1px solid var(--log-line);
      border-radius:11px;
      background:var(--log-bg);
      color:var(--log-ink);
      padding:11px;
      white-space:pre-wrap;
      font:12px/1.48 "Cascadia Code","Consolas",monospace
    }
    @keyframes pulse{0%{transform:scale(.8);opacity:.6}50%{transform:scale(1.2);opacity:1}100%{transform:scale(.8);opacity:.6}}
    @media (max-width:820px){body{padding:12px}.hero h1{font-size:24px}}
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div>
        <h1>SpecFactory Launcher</h1>
        <p>SpecFactory-style runtime console with live install/launch controls and health status.</p>
      </div>
      <div class="state" id="op-state"><span class="dot"></span><span>Idle</span></div>
    </section>

    <section class="panel">
      <div class="row">
        <div>
          <strong>Environment Matrix</strong>
          <div class="muted">Core runtime, Python modules, and service endpoints.</div>
        </div>
        <div class="actions">
          <label class="toggle">
            <input type="checkbox" id="strict-services" />
            <span>Strict service checks</span>
            <span
              class="tip"
              tabindex="0"
              aria-label="Strict service checks details"
              data-tip-title="Strict Service Checks"
              data-tip-what="Validation mode used during dependency install."
              data-tip-does="Requires every required endpoint to be reachable before install can complete."
              data-tip-impact="Enabling this blocks false-green setups where core services are down."
              data-tip-action="Use when you want hard validation before running SpecFactory."
            >?</span>
          </label>
          <button class="btn alt" id="settings-btn">Settings</button>
          <button class="btn alt" id="refresh-btn">Refresh</button>
          <button class="btn alt" id="chatmock-btn">Start ChatMock Stack</button>
          <button class="btn alt" id="launch-btn">Launch SpecFactory.exe</button>
          <button class="btn" id="install-btn">Install All Dependencies</button>
        </div>
      </div>
      <div class="settings-wrap" id="settings-wrap" hidden>
        <div class="settings-card">
          <div class="settings-head">
            <strong>Launcher Settings</strong>
            <button class="mini-btn" id="settings-close-btn">Close</button>
          </div>
          <div class="settings-grid">
            <div class="settings-item">
              <div class="field-label">Theme</div>
              <button class="btn alt" id="theme-btn">Switch to Light</button>
            </div>
            <div class="settings-item">
              <div class="field-label">Background</div>
              <select class="select" id="bg-select"></select>
              <div class="field-note" id="bg-hint">best for dark</div>
            </div>
          </div>
        </div>
      </div>
      <div class="summary" id="summary"></div>
      <div class="alerts" id="alerts"></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dependency</th><th>Installed</th><th>Running</th><th>Health</th><th>Action</th><th>Details</th>
            </tr>
          </thead>
          <tbody id="checks-body"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <div class="row">
        <strong>Setup Output</strong>
        <button class="btn alt" id="clear-btn">Clear Logs</button>
      </div>
      <div class="logbox" id="logs">No installer activity yet.</div>
    </section>
  </div>
  <div class="floating-tip" id="floating-tip" hidden></div>

  <script>
    const summaryEl = document.getElementById('summary');
    const alertsEl = document.getElementById('alerts');
    const checksBodyEl = document.getElementById('checks-body');
    const logsEl = document.getElementById('logs');
    const installBtn = document.getElementById('install-btn');
    const chatmockBtn = document.getElementById('chatmock-btn');
    const launchBtn = document.getElementById('launch-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const clearBtn = document.getElementById('clear-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsWrap = document.getElementById('settings-wrap');
    const settingsCloseBtn = document.getElementById('settings-close-btn');
    const themeBtn = document.getElementById('theme-btn');
    const bgSelect = document.getElementById('bg-select');
    const bgHintEl = document.getElementById('bg-hint');
    const strictCheckbox = document.getElementById('strict-services');
    const opStateEl = document.getElementById('op-state');
    const floatingTipEl = document.getElementById('floating-tip');
    const THEME_KEY = 'specfactory_launcher_theme';
    const BG_KEY = 'specfactory_launcher_bg';
    const BACKGROUND_PRESETS = {
      neural_red: {
        label: 'Neural Red Grid',
        best_for: 'dark',
        url: 'https://unsplash.com/photos/7ELYu7jeEwo/download?force=true&w=2400'
      },
      blue_orbit: {
        label: 'Blue Orbit Mesh',
        best_for: 'dark',
        url: 'https://unsplash.com/photos/U6or0MrLetM/download?force=true&w=2400'
      },
      midnight_circuit: {
        label: 'Midnight Circuit',
        best_for: 'dark',
        url: 'https://unsplash.com/photos/BasVH2YQ1RA/download?force=true&w=2400'
      },
      graphite_servers: {
        label: 'Graphite Server Racks',
        best_for: 'dark',
        url: 'https://unsplash.com/photos/24R-2bFSImI/download?force=true&w=2400'
      },
      deep_vector: {
        label: 'Deep Vector Tunnel',
        best_for: 'dark',
        url: 'https://unsplash.com/photos/m-VehD7wUOc/download?force=true&w=2400'
      },
      soft_blueprint: {
        label: 'Soft Blueprint Panels',
        best_for: 'light',
        url: 'https://unsplash.com/photos/jK9WdI63OMU/download?force=true&w=2400'
      },
      bright_mesh: {
        label: 'Bright Mesh Lattice',
        best_for: 'light',
        url: 'https://unsplash.com/photos/jvDG-5Ja7y4/download?force=true&w=2400'
      },
      silver_gradient: {
        label: 'Silver Gradient Flow',
        best_for: 'light',
        url: 'https://unsplash.com/photos/vo-M6JACr-k/download?force=true&w=2400'
      },
      skylight_lines: {
        label: 'Skylight Data Lines',
        best_for: 'light',
        url: 'https://unsplash.com/photos/3jRq0Tcr1Ws/download?force=true&w=2400'
      },
      cloud_nodes: {
        label: 'Cloud Node Texture',
        best_for: 'light',
        url: 'https://unsplash.com/photos/9HGPvHThNME/download?force=true&w=2400'
      }
    };
    const BACKGROUND_ALIASES = {
      dark_wave: 'midnight_circuit',
      spectrum_lines: 'deep_vector'
    };
    const DEFAULT_BG_PRESET = 'neural_red';
    const DEPENDENCY_TOOLTIPS = {
      node_runtime: {
        title: 'SpecFactory Runtime (Node.js)',
        what: 'Node.js runtime environment for core application scripts.',
        does: 'Executes Launcher, setup checks, API services, and SpecFactory CLI workflows.',
        impact: 'Required for launch readiness.'
      },
      npm_cli: {
        title: 'npm CLI',
        what: 'Package manager for JavaScript/Node dependencies.',
        does: 'Installs and updates project packages from package-lock.',
        impact: 'Required for launch readiness.'
      },
      npx_cli: {
        title: 'npx CLI',
        what: 'Command runner for project-local Node tools.',
        does: 'Runs tools like Playwright without global installs.',
        impact: 'Required for launch readiness.'
      },
      node_modules: {
        title: 'Node Modules Installed',
        what: 'Resolved dependency tree in node_modules folder.',
        does: 'Provides runtime libraries needed by SpecFactory and Launcher.',
        impact: 'Required for launch readiness.'
      },
      playwright_browser: {
        title: 'Playwright Chromium',
        what: 'Local Chromium binary used by Playwright.',
        does: 'Powers browser automation and page extraction tasks.',
        impact: 'Required for launch readiness.'
      },
      python_runtime: {
        title: 'Python Runtime',
        what: 'Python interpreter used by helper tooling.',
        does: 'Runs Python dependency installs and extraction helpers.',
        impact: 'Required for launch readiness.'
      },
      python_pdfplumber: {
        title: 'Python: pdfplumber',
        what: 'PDF parsing library for structured document extraction.',
        does: 'Extracts text/table content from PDFs during data processing.',
        impact: 'Required for launch readiness.'
      },
      python_requests: {
        title: 'Python: requests',
        what: 'HTTP client library for Python workflows.',
        does: 'Supports network calls used by Python-based utilities.',
        impact: 'Required for launch readiness.'
      },
      docker_cli: {
        title: 'Docker CLI',
        what: 'Docker command-line client.',
        does: 'Starts and manages local containerized services (ChatMock/SearXNG).',
        impact: 'Optional unless those stacks are enabled.'
      },
      docker_daemon: {
        title: 'Docker Daemon',
        what: 'Docker engine service running locally.',
        does: 'Executes containers required by ChatMock and SearXNG stacks.',
        impact: 'Optional unless containerized services are enabled.'
      },
      svc_llm_sync: {
        title: 'LLM/Cortex Sync Endpoint',
        what: 'Primary synchronous model endpoint (typically localhost:5001).',
        does: 'Handles direct request/response model calls from SpecFactory.',
        impact: 'Required when LLM/Cortex mode is enabled.'
      },
      svc_cortex_async: {
        title: 'Cortex Async Endpoint',
        what: 'Optional asynchronous job endpoint (often localhost:4000/api).',
        does: 'Handles queued/background model jobs and job status polling.',
        impact: 'Optional, but useful for long-running operations.'
      },
      svc_searxng: {
        title: 'SearXNG Endpoint',
        what: 'Local search aggregation endpoint (commonly localhost:8080).',
        does: 'Provides web search capability for discovery/research pipelines.',
        impact: 'Optional unless SEARCH_PROVIDER is set to searxng.'
      },
      svc_chatmock: {
        title: 'ChatMock Endpoint',
        what: 'Local eval-bench stack endpoint.',
        does: 'Hosts local testing/evaluation services used by the LLM lab flow.',
        impact: 'Optional unless ChatMock-driven eval flow is in use.'
      },
      specfactory_app: {
        title: 'SpecFactory App',
        what: 'Main desktop executable in project root (SpecFactory.exe).',
        does: 'Launches the full SpecFactory runtime UI and app experience.',
        impact: 'Optional check, but required to launch app from Launcher.'
      }
    };

    let installState = null;
    let chatmockState = null;
    let actionState = null;
    let checks = [];
    let prevBusy = false;
    let lastStatusAt = 0;
    let lastChecksRenderKey = '';
    let activeTipTarget = null;

    function esc(value) {
      return String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    }

    function escAttr(value) {
      return esc(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }

    function isBusy() {
      return Boolean((installState && installState.running) || (chatmockState && chatmockState.running) || (actionState && actionState.running));
    }

    function requiredChecksHealthy(rows) {
      return rows.filter((row) => row.required).every((row) => row.status === 'ok');
    }

    function findSpecFactoryRow(rows) {
      return rows.find((row) => row.id === 'specfactory_app');
    }

    function canLaunchSpecFactory(rows) {
      const appRow = findSpecFactoryRow(rows);
      if (!appRow || !appRow.action_id) {
        return false;
      }
      return requiredChecksHealthy(rows);
    }

    function chipClass(value, kind) {
      const token = String(value || '').toLowerCase();
      if (kind === 'health') {
        if (token === 'ok') return 'chip ok';
        if (token === 'warn') return 'chip warn';
        return 'chip bad';
      }
      if (token === 'installed' || token === 'ready') return 'chip ok';
      if (token === 'running' || token === 'active' || token === 'live') return 'chip live';
      if (token === 'missing') return 'chip bad';
      if (token === 'inactive' || token === 'down') return 'chip warn';
      return 'chip idle';
    }

    function buildChecksRenderKey(rows) {
      const ordered = rows.slice().sort((a, b) => String(a.id || a.name || '').localeCompare(String(b.id || b.name || '')));
      const rowToken = ordered.map((row) => [
        row.id || '',
        row.name || '',
        row.category || '',
        row.required ? '1' : '0',
        row.status || '',
        row.installed_state || '',
        row.running_state || '',
        row.details || '',
        row.action_id || '',
        row.action_label || ''
      ].join('~')).join('||');
      const runtimeToken = [
        installState?.running ? '1' : '0',
        chatmockState?.running ? '1' : '0',
        actionState?.running ? '1' : '0',
        actionState?.action_id || '',
        actionState?.action_label || '',
        actionState?.success === null ? 'n' : (actionState?.success ? '1' : '0'),
        actionState?.finished_at || ''
      ].join('~');
      return rowToken + '##' + runtimeToken;
    }

    function setOpState(mode, text) {
      const dotClass = mode === 'running' ? 'dot run' : (mode === 'ok' ? 'dot ok' : (mode === 'err' ? 'dot err' : 'dot'));
      opStateEl.innerHTML = '<span class="' + dotClass + '"></span><span>' + esc(text) + '</span>';
    }

    function applyTheme(theme, persist = true) {
      const nextTheme = theme === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      if (themeBtn) {
        themeBtn.textContent = nextTheme === 'dark' ? 'Switch to Light' : 'Switch to Dark';
      }
      if (persist) {
        try {
          localStorage.setItem(THEME_KEY, nextTheme);
        } catch {
          // ignore storage errors
        }
      }
    }

    function initTheme() {
      let storedTheme = '';
      try {
        storedTheme = localStorage.getItem(THEME_KEY) || '';
      } catch {
        storedTheme = '';
      }
      if (storedTheme === 'light' || storedTheme === 'dark') {
        applyTheme(storedTheme, false);
        return;
      }
      applyTheme('dark', false);
    }

    function populateBackgroundOptions() {
      if (!bgSelect) {
        return;
      }
      bgSelect.innerHTML = '';

      const groups = [
        { key: 'dark', label: 'Best for Dark' },
        { key: 'light', label: 'Best for Light' }
      ];

      for (const group of groups) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.label;
        for (const [presetKey, presetMeta] of Object.entries(BACKGROUND_PRESETS)) {
          if (presetMeta.best_for !== group.key) {
            continue;
          }
          const option = document.createElement('option');
          option.value = presetKey;
          option.textContent = presetMeta.label;
          optgroup.appendChild(option);
        }
        bgSelect.appendChild(optgroup);
      }
    }

    function updateBackgroundHint(presetKey) {
      if (!bgHintEl) {
        return;
      }
      const preset = BACKGROUND_PRESETS[presetKey];
      if (!preset) {
        bgHintEl.textContent = '';
        return;
      }
      bgHintEl.textContent = preset.best_for === 'light' ? 'best for light' : 'best for dark';
    }

    function applyBackground(preset, persist = true) {
      const alias = Object.prototype.hasOwnProperty.call(BACKGROUND_ALIASES, preset)
        ? BACKGROUND_ALIASES[preset]
        : preset;
      const nextPreset = Object.prototype.hasOwnProperty.call(BACKGROUND_PRESETS, alias) ? alias : DEFAULT_BG_PRESET;
      const nextUrl = BACKGROUND_PRESETS[nextPreset].url;
      document.documentElement.style.setProperty('--tech-bg-image', "url('" + nextUrl + "')");
      if (bgSelect) {
        bgSelect.value = nextPreset;
      }
      updateBackgroundHint(nextPreset);
      if (persist) {
        try {
          localStorage.setItem(BG_KEY, nextPreset);
        } catch {
          // ignore storage errors
        }
      }
    }

    function initBackground() {
      let storedPreset = '';
      try {
        storedPreset = localStorage.getItem(BG_KEY) || '';
      } catch {
        storedPreset = '';
      }
      applyBackground(storedPreset || DEFAULT_BG_PRESET, false);
    }

    function setSettingsOpen(open) {
      const isOpen = Boolean(open);
      if (settingsWrap) {
        settingsWrap.hidden = !isOpen;
      }
      if (settingsBtn) {
        settingsBtn.textContent = isOpen ? 'Close Settings' : 'Settings';
      }
    }

    function dependencyTooltipFor(row) {
      const fallbackImpact = row?.required
        ? 'Required for launch readiness.'
        : 'Optional dependency.';
      const mapped = DEPENDENCY_TOOLTIPS[row?.id] || null;
      const what = mapped?.what || 'Environment dependency tracked by launcher health checks.';
      const does = mapped?.does || 'Supports setup validation, install flow, and runtime readiness.';
      const impact = mapped?.impact || fallbackImpact;
      const action = row?.action_label
        ? ('Use "' + row.action_label + '" to fix or launch this dependency from this row.')
        : (row?.status === 'ok'
            ? 'No action needed. This dependency is currently healthy.'
            : 'No direct action button is available for this dependency.');
      return {
        title: row?.name || mapped?.title || 'Dependency',
        what,
        does,
        impact,
        action
      };
    }

    function tipMarkup(payload) {
      const title = String(payload?.title || 'Dependency');
      const what = String(payload?.what || '');
      const does = String(payload?.does || '');
      const impact = String(payload?.impact || '');
      const action = String(payload?.action || '');
      const aria = [title, what, does, impact, action].filter(Boolean).join('. ');
      return '<span class="tip" tabindex="0" aria-label="' + escAttr(aria) + '" data-tip-title="' + escAttr(title) + '" data-tip-what="' + escAttr(what) + '" data-tip-does="' + escAttr(does) + '" data-tip-impact="' + escAttr(impact) + '" data-tip-action="' + escAttr(action) + '">?</span>';
    }

    function readTipPayload(target) {
      if (!target) {
        return null;
      }
      const title = String(target.getAttribute('data-tip-title') || '').trim();
      const what = String(target.getAttribute('data-tip-what') || '').trim();
      const does = String(target.getAttribute('data-tip-does') || '').trim();
      const impact = String(target.getAttribute('data-tip-impact') || '').trim();
      const action = String(target.getAttribute('data-tip-action') || '').trim();
      if (!title && !what && !does && !impact && !action) {
        return null;
      }
      return { title, what, does, impact, action };
    }

    function buildFloatingTipMarkup(payload) {
      const rows = [
        ['What', payload?.what],
        ['Does', payload?.does],
        ['Impact', payload?.impact],
        ['Action', payload?.action]
      ].filter((row) => String(row[1] || '').trim().length > 0);
      return [
        '<div class="floating-tip-card">',
        '<div class="floating-tip-title">' + esc(payload?.title || 'Dependency') + '</div>',
        '<div class="floating-tip-grid">',
        rows.map((row) => '<div class="floating-tip-row"><div class="floating-tip-k">' + esc(row[0]) + '</div><div class="floating-tip-v">' + esc(row[1]) + '</div></div>').join(''),
        '</div>',
        '</div>'
      ].join('');
    }

    function positionFloatingTip(target) {
      if (!floatingTipEl || floatingTipEl.hidden || !target || !document.body.contains(target)) {
        return;
      }
      const margin = 10;
      const anchor = target.getBoundingClientRect();
      const tipRect = floatingTipEl.getBoundingClientRect();
      let top = anchor.top - tipRect.height - margin;
      let left = anchor.left + (anchor.width / 2) - (tipRect.width / 2);

      if (top < margin) {
        top = anchor.bottom + margin;
      }
      if (left < margin) {
        left = margin;
      }
      if (left + tipRect.width > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - tipRect.width - margin);
      }
      if (top + tipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tipRect.height - margin);
      }

      floatingTipEl.style.left = Math.round(left) + 'px';
      floatingTipEl.style.top = Math.round(top) + 'px';
    }

    function showFloatingTip(target) {
      if (!floatingTipEl) {
        return;
      }
      const payload = readTipPayload(target);
      if (!payload) {
        hideFloatingTip();
        return;
      }
      activeTipTarget = target;
      floatingTipEl.innerHTML = buildFloatingTipMarkup(payload);
      floatingTipEl.hidden = false;
      floatingTipEl.classList.remove('show');
      positionFloatingTip(target);
      requestAnimationFrame(() => {
        if (activeTipTarget !== target || !floatingTipEl || floatingTipEl.hidden) {
          return;
        }
        positionFloatingTip(target);
        floatingTipEl.classList.add('show');
      });
    }

    function hideFloatingTip() {
      activeTipTarget = null;
      if (!floatingTipEl) {
        return;
      }
      floatingTipEl.classList.remove('show');
      floatingTipEl.hidden = true;
      floatingTipEl.innerHTML = '';
    }

    function findTipTarget(node) {
      return node?.closest ? node.closest('.tip') : null;
    }

    function renderSummary(summary) {
      const total = Number(summary?.total || 0);
      const ok = Number(summary?.ok || 0);
      const missingRequired = Number(summary?.missing_required || 0);
      const needsAttention = Number(summary?.warn || 0) + Number(summary?.missing_optional || 0);
      const rows = [
        { k: 'Total Checks', v: total },
        { k: 'Healthy', v: ok },
        { k: 'Missing Required', v: missingRequired },
        { k: 'Needs Attention', v: needsAttention }
      ];
      summaryEl.innerHTML = rows.map((row) => '<div class="item"><div class="k">' + esc(row.k) + '</div><div class="v">' + esc(row.v) + '</div></div>').join('');
    }

    function renderAlerts(rows) {
      const nonOk = rows.filter((row) => row.status !== 'ok');
      if (!nonOk.length) {
        const launchHint = canLaunchSpecFactory(rows)
          ? ' Launch is ready.'
          : ' Resolve required checks to enable Launch SpecFactory.exe.';
        alertsEl.innerHTML = '<span class="empty">All checks are currently healthy.' + esc(launchHint) + '</span>';
        return;
      }
      alertsEl.innerHTML = nonOk.map((row) => {
        const action = row.action_label ? (' | action: ' + row.action_label) : '';
        const required = row.required ? 'required' : 'optional';
        return '<div><strong>' + esc(row.name) + '</strong> (' + required + ') - ' + esc(row.details || row.status) + esc(action) + '</div>';
      }).join('');
    }

    function renderChecks(rows) {
      const renderKey = buildChecksRenderKey(rows);
      if (renderKey === lastChecksRenderKey) {
        return;
      }
      lastChecksRenderKey = renderKey;
      const ordered = rows.slice().sort((a, b) => {
        const rank = { missing: 0, warn: 1, ok: 2 };
        const rA = rank[a.status] ?? 3;
        const rB = rank[b.status] ?? 3;
        if (rA !== rB) return rA - rB;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      hideFloatingTip();
      const busy = isBusy();
      const launchReady = requiredChecksHealthy(rows);
      checksBodyEl.innerHTML = ordered.map((row) => {
        const installed = row.installed_state || (row.status === 'ok' ? 'installed' : 'missing');
        const running = row.running_state || (row.status === 'ok' ? 'running' : 'inactive');
        const hasAction = Boolean(row.action_id && row.action_label);
        const isChatmockRow = row.id === 'svc_chatmock';
        const chatmockBusy = Boolean(chatmockState?.running) || Boolean(actionState?.running && actionState?.action_id === 'start_chatmock_stack');
        const activeAction = chatmockBusy && isChatmockRow
          ? true
          : Boolean(actionState?.running && actionState?.action_id === row.action_id);
        const launchBlocked = row.action_id === 'launch_specfactory_exe' && !launchReady;
        const actionText = launchBlocked
          ? 'Needs Required Checks'
          : (activeAction ? 'Working...' : (row.action_label || 'No action'));
        const actionDisabled = busy || launchBlocked;
        const tipPayload = dependencyTooltipFor(row);
        const nameCell = '<div class="name dep-title"><span>' + esc(row.name) + '</span>' + tipMarkup(tipPayload) + '</div>';
        const actionButton = hasAction
          ? '<button class="mini-btn" data-action-id="' + escAttr(row.action_id) + '" data-action-label="' + escAttr(row.action_label) + '" ' + (actionDisabled ? 'disabled' : '') + '>' + esc(actionText) + '</button>'
          : '<span class="mini-btn" style="opacity:.55;border-style:dashed;">No action</span>';
        const rowClass = activeAction ? ' class="updating"' : '';
        return [
          '<tr' + rowClass + '>',
          '<td>' + nameCell + '<div class="meta">' + esc(row.category || 'misc') + ' | ' + (row.required ? 'required' : 'optional') + '</div></td>',
          '<td><span class="' + chipClass(installed, 'installed') + '">' + esc(installed) + '</span></td>',
          '<td><span class="' + chipClass(running, 'running') + '">' + esc(running) + '</span></td>',
          '<td><span class="' + chipClass(row.status, 'health') + '">' + esc(row.status || 'unknown') + '</span></td>',
          '<td>' + actionButton + '</td>',
          '<td class="muted">' + esc(row.details || '') + '</td>',
          '</tr>'
        ].join('');
      }).join('');
    }

    function updateMainButtons() {
      const busy = isBusy();
      installBtn.disabled = busy;
      chatmockBtn.disabled = busy;
      launchBtn.disabled = busy || !canLaunchSpecFactory(checks);
    }

    function updateOpState() {
      if (installState?.running) { setOpState('running', 'Installing dependencies...'); return; }
      if (chatmockState?.running) { setOpState('running', 'Starting ChatMock stack...'); return; }
      if (actionState?.running) { setOpState('running', (actionState.action_label || 'Running action') + '...'); return; }
      if (installState?.finished_at && installState.success === false) { setOpState('err', 'Install failed'); return; }
      if (chatmockState?.finished_at && chatmockState.success === false) { setOpState('err', 'ChatMock start failed'); return; }
      if (actionState?.finished_at && actionState.success === false) { setOpState('err', (actionState.action_label || 'Action') + ' failed'); return; }
      if (actionState?.finished_at && actionState.success === true && actionState.result?.restart_required) { setOpState('ok', (actionState.action_label || 'Action') + ' completed (restart setup app)'); return; }
      if (installState?.finished_at && installState.success === true) { setOpState('ok', 'Install completed'); return; }
      if (chatmockState?.finished_at && chatmockState.success === true) { setOpState('ok', 'ChatMock stack started'); return; }
      if (actionState?.finished_at && actionState.success === true) { setOpState('ok', actionState.action_label || 'Action completed'); return; }
      setOpState('idle', 'Idle');
    }

    async function fetchJson(url, options = undefined) {
      const response = await fetch(url, options);
      if (!response.ok) {
        let message = 'HTTP ' + response.status;
        try {
          const body = await response.json();
          if (body?.error) message += ': ' + body.error;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }
      return response.json();
    }

    async function refreshStatus(force = false) {
      const now = Date.now();
      if (!force && now - lastStatusAt < 1000) return;
      const payload = await fetchJson('/api/status');
      checks = Array.isArray(payload.checks) ? payload.checks : [];
      renderSummary(payload.summary || {});
      renderAlerts(checks);
      renderChecks(checks);
      lastStatusAt = now;
    }

    function renderInstallState(state) {
      installState = state;
      const logs = Array.isArray(state.logs) ? state.logs : [];
      logsEl.textContent = logs.length ? logs.join('\\n') : 'No installer activity yet.';
      logsEl.scrollTop = logsEl.scrollHeight;
    }

    function renderChatmockState(state) { chatmockState = state; }
    function renderActionState(state) { actionState = state; }

    async function pollStates() {
      const [install, chatmock, action] = await Promise.all([
        fetchJson('/api/install/state'),
        fetchJson('/api/chatmock/state'),
        fetchJson('/api/action/state')
      ]);
      renderInstallState(install);
      renderChatmockState(chatmock);
      renderActionState(action);
      updateMainButtons();
      updateOpState();
      renderChecks(checks);
    }

    async function startInstall() {
      await fetchJson('/api/install', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ strictServices: Boolean(strictCheckbox.checked) })
      });
    }

    async function startChatmock() {
      await fetchJson('/api/chatmock/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({})
      });
    }

    async function launchSpecFactory() {
      await startAction('launch_specfactory_exe', 'Launch SpecFactory');
    }

    async function startAction(actionId, actionLabel) {
      await fetchJson('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionId, actionLabel })
      });
    }

    async function clearLogs() {
      await fetchJson('/api/install/clear', { method: 'POST' });
    }

    async function tick(force = false) {
      try {
        await pollStates();
        await refreshStatus(force || isBusy());
        const busy = isBusy();
        if (prevBusy && !busy) {
          await refreshStatus(true);
          setTimeout(() => { refreshStatus(true).catch(() => {}); }, 1800);
        }
        prevBusy = busy;
      } catch {
        setOpState('err', 'Status API unavailable');
      }
    }

    async function handleError(error, fallbackText) {
      const message = String(error?.message || fallbackText || 'Operation failed');
      setOpState('err', message);
      alert(message);
      await tick(true);
    }

    installBtn.addEventListener('click', async () => {
      try { await startInstall(); await tick(true); }
      catch (error) { await handleError(error, 'Unable to start install'); }
    });

    chatmockBtn.addEventListener('click', async () => {
      try { await startChatmock(); await tick(true); }
      catch (error) { await handleError(error, 'Unable to start ChatMock'); }
    });

    launchBtn.addEventListener('click', async () => {
      try { await launchSpecFactory(); await tick(true); }
      catch (error) { await handleError(error, 'Unable to launch SpecFactory'); }
    });

    refreshBtn.addEventListener('click', async () => {
      try { await tick(true); }
      catch (error) { await handleError(error, 'Unable to refresh'); }
    });

    clearBtn.addEventListener('click', async () => {
      try { await clearLogs(); await tick(true); }
      catch (error) { await handleError(error, 'Unable to clear logs'); }
    });

    settingsBtn.addEventListener('click', () => {
      const currentlyOpen = settingsWrap && settingsWrap.hidden === false;
      setSettingsOpen(!currentlyOpen);
    });

    settingsCloseBtn.addEventListener('click', () => {
      setSettingsOpen(false);
    });

    themeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });

    bgSelect.addEventListener('change', () => {
      applyBackground(bgSelect.value);
    });

    checksBodyEl.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action-id]');
      if (!button || button.disabled) return;
      const actionId = button.getAttribute('data-action-id') || '';
      const actionLabel = button.getAttribute('data-action-label') || '';
      if (!actionId) return;
      try {
        if (actionId === 'start_chatmock_stack') {
          await startChatmock();
        } else {
          await startAction(actionId, actionLabel);
        }
        await tick(true);
      } catch (error) {
        await handleError(error, 'Unable to run action');
      }
    });

    document.addEventListener('mouseover', (event) => {
      const tipTarget = findTipTarget(event.target);
      if (!tipTarget) {
        return;
      }
      if (activeTipTarget !== tipTarget) {
        showFloatingTip(tipTarget);
      } else {
        positionFloatingTip(tipTarget);
      }
    });

    document.addEventListener('mouseout', (event) => {
      const fromTip = findTipTarget(event.target);
      if (!fromTip) {
        return;
      }
      const toTip = findTipTarget(event.relatedTarget);
      if (toTip === fromTip) {
        return;
      }
      if (activeTipTarget === fromTip) {
        hideFloatingTip();
      }
    });

    document.addEventListener('focusin', (event) => {
      const tipTarget = findTipTarget(event.target);
      if (!tipTarget) {
        return;
      }
      showFloatingTip(tipTarget);
    });

    document.addEventListener('focusout', (event) => {
      const fromTip = findTipTarget(event.target);
      if (!fromTip) {
        return;
      }
      const toTip = findTipTarget(event.relatedTarget);
      if (toTip === fromTip) {
        return;
      }
      if (activeTipTarget === fromTip) {
        hideFloatingTip();
      }
    });

    window.addEventListener('resize', () => {
      if (activeTipTarget && document.body.contains(activeTipTarget)) {
        positionFloatingTip(activeTipTarget);
        return;
      }
      hideFloatingTip();
    });

    window.addEventListener('scroll', () => {
      if (activeTipTarget && document.body.contains(activeTipTarget)) {
        positionFloatingTip(activeTipTarget);
        return;
      }
      hideFloatingTip();
    }, true);

    initTheme();
    populateBackgroundOptions();
    initBackground();
    setSettingsOpen(false);
    tick(true);
    setInterval(() => { tick(false); }, 1200);
  </script>
</body>
</html>`;
}
function buildInstallState() {
  return {
    running: false,
    strict_services: false,
    success: null,
    started_at: null,
    finished_at: null,
    logs: []
  };
}
function buildChatmockState() {
  return {
    running: false,
    success: null,
    started_at: null,
    finished_at: null,
    result: null,
    error: null
  };
}
function buildActionState() {
  return {
    running: false,
    action_id: "",
    action_label: "",
    success: null,
    started_at: null,
    finished_at: null,
    result: null,
    error: null
  };
}
async function main() {
  process.chdir(ROOT);
  const args = parseArgs(process.argv.slice(2));
  const requestedPort = Math.max(1, Number.parseInt(String(args.port || "8799"), 10) || 8799);
  const noOpen = Boolean(args["no-open"]);
  const html = buildHtml();
  const installState = buildInstallState();
  const chatmockState = buildChatmockState();
  const actionState = buildActionState();
  const appendInstallLog = (line) => {
    const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(11, 19);
    installState.logs.push(`[${stamp}] ${line}`);
    if (installState.logs.length > 4e3) {
      installState.logs.splice(0, installState.logs.length - 4e3);
    }
  };
  const isBusy = () => Boolean(
    installState.running || chatmockState.running || actionState.running
  );
  const startInstall = (strictServices) => {
    if (isBusy()) {
      return false;
    }
    installState.running = true;
    installState.strict_services = Boolean(strictServices);
    installState.success = null;
    installState.started_at = (/* @__PURE__ */ new Date()).toISOString();
    installState.finished_at = null;
    installState.logs.push("");
    installState.logs.push(`Starting dependency install (strict_services=${installState.strict_services})`);
    installDependencies({
      root: ROOT,
      strictServices: installState.strict_services,
      onLine: appendInstallLog
    }).then((result) => {
      appendInstallLog(`Install completed: ${JSON.stringify(result)}`);
      installState.running = false;
      installState.success = true;
      installState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
    }).catch((error) => {
      appendInstallLog(`Install failed: ${error.message || error}`);
      installState.running = false;
      installState.success = false;
      installState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
    });
    return true;
  };
  const startChatmock = () => {
    if (isBusy()) {
      return false;
    }
    chatmockState.running = true;
    chatmockState.success = null;
    chatmockState.started_at = (/* @__PURE__ */ new Date()).toISOString();
    chatmockState.finished_at = null;
    chatmockState.result = null;
    chatmockState.error = null;
    installState.logs.push("");
    installState.logs.push("Starting ChatMock eval-bench stack...");
    runSetupAction({
      root: ROOT,
      actionId: "start_chatmock_stack",
      onLine: appendInstallLog
    }).then((result) => {
      appendInstallLog(`ChatMock stack result: ${JSON.stringify(result)}`);
      chatmockState.running = false;
      chatmockState.success = true;
      chatmockState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
      chatmockState.result = result;
    }).catch((error) => {
      appendInstallLog(`ChatMock start failed: ${error.message || error}`);
      chatmockState.running = false;
      chatmockState.success = false;
      chatmockState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
      chatmockState.error = String(error?.message || error);
    });
    return true;
  };
  const startAction = (actionId, actionLabel) => {
    if (isBusy()) {
      return false;
    }
    actionState.running = true;
    actionState.action_id = actionId || "";
    actionState.action_label = actionLabel || actionId || "Action";
    actionState.success = null;
    actionState.started_at = (/* @__PURE__ */ new Date()).toISOString();
    actionState.finished_at = null;
    actionState.result = null;
    actionState.error = null;
    installState.logs.push("");
    installState.logs.push(`Running action: ${actionState.action_label}`);
    runSetupAction({
      root: ROOT,
      actionId: actionState.action_id,
      onLine: appendInstallLog
    }).then((result) => {
      appendInstallLog(`Action completed: ${JSON.stringify(result)}`);
      actionState.running = false;
      actionState.success = true;
      actionState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
      actionState.result = result;
    }).catch((error) => {
      appendInstallLog(`Action failed (${actionState.action_label}): ${error.message || error}`);
      actionState.running = false;
      actionState.success = false;
      actionState.finished_at = (/* @__PURE__ */ new Date()).toISOString();
      actionState.error = String(error?.message || error);
    });
    return true;
  };
  const server = import_node_http.default.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const url2 = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = url2.pathname;
    if (method === "GET" && pathname === "/") {
      sendHtml(res, html);
      return;
    }
    if (method === "GET" && pathname === "/api/status") {
      try {
        const status = await collectSetupStatus({ root: ROOT });
        sendJson(res, 200, status);
      } catch (error) {
        sendJson(res, 500, { ok: false, error: String(error.message || error) });
      }
      return;
    }
    if (method === "GET" && pathname === "/api/install/state") {
      sendJson(res, 200, installState);
      return;
    }
    if (method === "GET" && pathname === "/api/chatmock/state") {
      sendJson(res, 200, chatmockState);
      return;
    }
    if (method === "GET" && pathname === "/api/action/state") {
      sendJson(res, 200, actionState);
      return;
    }
    if (method === "POST" && pathname === "/api/install") {
      try {
        const body = await parseJsonBody(req);
        const strictServices = Boolean(body.strictServices);
        if (!startInstall(strictServices)) {
          sendJson(res, 409, { ok: false, error: "operation_already_running" });
          return;
        }
        sendJson(res, 202, { ok: true, running: true, strict_services: strictServices });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error.message || error) });
      }
      return;
    }
    if (method === "POST" && pathname === "/api/chatmock/start") {
      if (!startChatmock()) {
        sendJson(res, 409, { ok: false, error: "operation_already_running" });
        return;
      }
      sendJson(res, 202, { ok: true, running: true });
      return;
    }
    if (method === "POST" && pathname === "/api/action") {
      try {
        const body = await parseJsonBody(req);
        const actionId = String(body.actionId || "").trim();
        const actionLabel = String(body.actionLabel || "").trim();
        if (!actionId) {
          sendJson(res, 400, { ok: false, error: "actionId_required" });
          return;
        }
        if (!startAction(actionId, actionLabel)) {
          sendJson(res, 409, { ok: false, error: "operation_already_running" });
          return;
        }
        sendJson(res, 202, { ok: true, running: true, action_id: actionId });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error.message || error) });
      }
      return;
    }
    if (method === "POST" && pathname === "/api/install/clear") {
      if (isBusy()) {
        sendJson(res, 409, { ok: false, error: "cannot_clear_while_running" });
        return;
      }
      installState.logs = [];
      installState.success = null;
      installState.started_at = null;
      installState.finished_at = null;
      chatmockState.success = null;
      chatmockState.started_at = null;
      chatmockState.finished_at = null;
      chatmockState.result = null;
      chatmockState.error = null;
      actionState.action_id = "";
      actionState.action_label = "";
      actionState.success = null;
      actionState.started_at = null;
      actionState.finished_at = null;
      actionState.result = null;
      actionState.error = null;
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not_found" });
  });
  const host = "127.0.0.1";
  const listen = (port) => new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  try {
    await listen(requestedPort);
  } catch (error) {
    if (error?.code !== "EADDRINUSE") {
      throw error;
    }
    await listen(0);
  }
  const address = server.address();
  const activePort = typeof address === "object" && address ? address.port : requestedPort;
  const url = `http://${host}:${activePort}/`;
  console.log("");
  console.log("+---------------------------------------------+");
  console.log("|         SpecFactory Setup GUI Ready          |");
  console.log("+---------------------------------------------+");
  console.log(`Project root: ${ROOT}`);
  console.log(`URL: ${url}`);
  console.log("");
  openBrowser(url, noOpen);
  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((error) => {
  console.error("");
  console.error("Setup GUI failed:", error.message || error);
  process.exitCode = 1;
});
