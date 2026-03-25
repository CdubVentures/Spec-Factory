function normalizeUrlToken(value, fallback) {
  const raw = String(value || '').trim() || String(fallback || '').trim();
  try {
    const parsed = new URL(raw);
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(fallback || '').trim().replace(/\/+$/, '');
  }
}

export function createSearxngRuntime({
  config,
  processRef,
  fsSync,
  resolveProjectPath,
  path,
  fetchImpl,
  setTimeoutFn,
  clearTimeoutFn,
  runCommandCapture,
  sleep,
} = {}) {
  const SEARXNG_CONTAINER_NAME = 'spec-harvester-searxng';
  const SEARXNG_DEFAULT_BASE_URL = 'http://127.0.0.1:8080';
  const SEARXNG_COMPOSE_PATH = resolveProjectPath(path.join('tools', 'searxng', 'docker-compose.yml'));

  async function probeSearxngHttp(baseUrl) {
    const normalizedBase = normalizeUrlToken(baseUrl, SEARXNG_DEFAULT_BASE_URL);
    if (typeof fetchImpl !== 'function') {
      return {
        ok: false,
        status: 0,
        error: 'fetch_unavailable',
      };
    }
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), 4_000);
    try {
      const probe = new URL('/search', `${normalizedBase}/`);
      probe.searchParams.set('q', 'health');
      probe.searchParams.set('format', 'json');
      probe.searchParams.set('language', 'en');
      probe.searchParams.set('safesearch', '0');
      const response = await fetchImpl(probe, { signal: controller.signal });
      return {
        ok: response.ok,
        status: response.status,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        error: error?.message || String(error || ''),
      };
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function getSearxngStatus() {
    const baseUrl = normalizeUrlToken(config.searxngBaseUrl || processRef.env.SEARXNG_BASE_URL || '', SEARXNG_DEFAULT_BASE_URL);
    const composeFileExists = fsSync.existsSync(SEARXNG_COMPOSE_PATH);
    const dockerVersion = await runCommandCapture('docker', ['--version'], { timeoutMs: 6_000 });
    const dockerAvailable = dockerVersion.ok;

    let running = false;
    let statusText = '';
    let portsText = '';
    let containerFound = false;
    let dockerPsError = '';

    if (dockerAvailable) {
      const ps = await runCommandCapture(
        'docker',
        ['ps', '-a', '--filter', `name=${SEARXNG_CONTAINER_NAME}`, '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}'],
        { timeoutMs: 10_000 },
      );
      if (ps.ok) {
        const first = String(ps.stdout || '')
          .split(/\r?\n/)
          .map((row) => row.trim())
          .find(Boolean) || '';
        if (first) {
          containerFound = true;
          const parts = first.split('\t');
          statusText = String(parts[1] || '').trim();
          portsText = String(parts[2] || '').trim();
          running = /^up\b/i.test(statusText);
        }
      } else {
        dockerPsError = String(ps.stderr || ps.error || '').trim();
      }
    }

    const httpProbe = running ? await probeSearxngHttp(baseUrl) : { ok: false, status: 0 };
    const httpReady = Boolean(httpProbe.ok);
    const canStart = dockerAvailable && composeFileExists;
    const needsStart = !running;

    let message = '';
    if (!dockerAvailable) {
      message = 'docker_not_available';
    } else if (!composeFileExists) {
      message = 'compose_file_missing';
    } else if (needsStart) {
      message = 'stopped';
    } else if (!httpReady) {
      message = 'container_running_http_unready';
    } else {
      message = 'ready';
    }

    return {
      container_name: SEARXNG_CONTAINER_NAME,
      compose_path: SEARXNG_COMPOSE_PATH,
      compose_file_exists: composeFileExists,
      base_url: baseUrl,
      docker_available: dockerAvailable,
      container_found: containerFound,
      running,
      status: statusText || (running ? 'Up' : 'Not running'),
      ports: portsText || '',
      http_ready: httpReady,
      http_status: Number(httpProbe.status || 0),
      can_start: canStart,
      needs_start: needsStart,
      message,
      docker_error: dockerPsError || undefined,
      http_error: httpProbe?.error || undefined,
    };
  }

  async function startSearxngStack() {
    const composeFileExists = fsSync.existsSync(SEARXNG_COMPOSE_PATH);
    if (!composeFileExists) {
      return {
        ok: false,
        error: 'compose_file_missing',
        status: await getSearxngStatus(),
      };
    }

    const up = await runCommandCapture(
      'docker',
      ['compose', '-f', SEARXNG_COMPOSE_PATH, 'up', '-d'],
      { timeoutMs: 60_000 },
    );
    if (!up.ok) {
      return {
        ok: false,
        error: String(up.stderr || up.error || 'docker_compose_up_failed').trim(),
        status: await getSearxngStatus(),
      };
    }

    for (let i = 0; i < 10; i += 1) {
      const status = await getSearxngStatus();
      if (status.http_ready || status.running) {
        return {
          ok: true,
          started: true,
          compose_stdout: String(up.stdout || '').trim(),
          status,
        };
      }
      await sleep(800);
    }

    return {
      ok: true,
      started: true,
      compose_stdout: String(up.stdout || '').trim(),
      status: await getSearxngStatus(),
    };
  }

  return {
    getSearxngStatus,
    startSearxngStack,
  };
}
