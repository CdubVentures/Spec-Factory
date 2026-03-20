export function parsePidRows(value) {
  return [...new Set(
    String(value || '')
      .split(/\r?\n/)
      .map((row) => Number.parseInt(String(row || '').trim(), 10))
      .filter((pid) => Number.isFinite(pid) && pid > 0),
  )];
}

export function killWindowsProcessTree({ pid, platform, execCb }) {
  const safePid = Number.parseInt(String(pid || ''), 10);
  if (!Number.isFinite(safePid) || safePid <= 0 || platform !== 'win32') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    execCb(`taskkill /PID ${safePid} /T /F`, (error) => {
      resolve(!error);
    });
  });
}

export async function findOrphanIndexLabPids({ platform, runCommandCapture }) {
  if (platform === 'win32') {
    const psScript = [
      "$ErrorActionPreference='SilentlyContinue'",
      'Get-CimInstance Win32_Process',
      '| Where-Object {',
      '  (',
      "    $_.Name -match '^(node|node\\.exe|cmd\\.exe|powershell\\.exe|pwsh\\.exe)$'",
      '  )',
      '  -and $_.CommandLine',
      '  -and (',
      "    $_.CommandLine -match 'src[\\\\/]cli[\\\\/](spec|indexlab)\\.js'",
      '  )',
      '  -and (',
      "    $_.CommandLine -match '\\bindexlab\\b'",
      "    -or $_.CommandLine -match '--mode\\s+indexlab'",
      "    -or $_.CommandLine -match '--local'",
      '  )',
      '}',
      '| Select-Object -ExpandProperty ProcessId',
    ].join(' ');
    const listed = await runCommandCapture(
      'powershell',
      ['-NoProfile', '-Command', psScript],
      { timeoutMs: 8_000 },
    );
    if (!listed.ok && !String(listed.stdout || '').trim()) return [];
    return parsePidRows(listed.stdout);
  }

  const listed = await runCommandCapture(
    'sh',
    ['-lc', "ps -eo pid=,args= | grep -E \"(node|sh|bash).*(src/cli/(spec|indexlab)\\.js).*(indexlab|--mode indexlab|--local)\" | grep -v grep | awk '{print $1}'"],
    { timeoutMs: 8_000 },
  );
  if (!listed.ok && !String(listed.stdout || '').trim()) return [];
  return parsePidRows(listed.stdout);
}
