// Starts the API (backend) and the UI (frontend) together: `npm start` from the repo root.
// Each service still starts on its own with `npm start` in its folder (brief: "npm start each").
// Output is prefixed per service; if either exits, or on Ctrl+C, both are stopped.
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const RESET = '\x1b[0m';

// `ng serve` also honours the PORT env var, so it must not inherit the API's PORT (both would bind it).
const apiPort = process.env.PORT ?? '3000';
const { PORT: _apiPortOnly, ...envWithoutPort } = process.env;

const services = [
  { name: 'api', command: 'npm start --prefix backend', env: { ...process.env, PORT: apiPort }, color: '\x1b[36m' },
  { name: 'web', command: 'npm start --prefix frontend -- --port 4200', env: envWithoutPort, color: '\x1b[35m' },
];

let stopping = false;

/** Kill the whole process tree (npm → node/ng), not just the shell. */
function stop(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else {
    try {
      process.kill(-child.pid, 'SIGTERM'); // detached → own process group
    } catch {
      /* already gone */
    }
  }
}

function prefixLines(stream, out, tag) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) out.write(`${tag}${line}\n`);
  });
}

const children = services.map(({ name, command, env, color }) => {
  const tag = `${color}[${name}]${RESET} `;
  // A single constant command string (no args array): shell:true is needed for npm.cmd on Windows.
  const child = spawn(command, { shell: true, detached: !isWindows, env });
  prefixLines(child.stdout, process.stdout, tag);
  prefixLines(child.stderr, process.stderr, tag);
  child.on('exit', (code) => {
    if (stopping) return;
    process.stderr.write(`${tag}exited (code ${code ?? 'signal'}); stopping all services\n`);
    shutdown(code === 0 ? 0 : 1);
  });
  return child;
});

function shutdown(code) {
  if (stopping) return;
  stopping = true;
  children.forEach(stop);
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log(`Starting PolicyQuote: API → http://localhost:${apiPort}   UI → http://localhost:4200   (Ctrl+C stops both)`);
if (apiPort !== '3000') {
  console.warn(`Note: the UI dev proxy (frontend/proxy.conf.json) targets port 3000, but the API is on ${apiPort}.`);
}
