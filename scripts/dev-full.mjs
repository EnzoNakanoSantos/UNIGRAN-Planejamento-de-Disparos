import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import process from 'node:process';

const execFileAsync = promisify(execFile);
const FRONTEND_PORT = 5173;
const children = [];
let shuttingDown = false;

async function findWindowsPidsByPort(port) {
  const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp']);
  const lines = stdout.split(/\r?\n/);
  const pids = new Set();

  for (const line of lines) {
    if (!line.includes(`:${port}`) || !line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts.at(-1);
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }

  return [...pids];
}

async function killWindowsPort(port) {
  const pids = await findWindowsPidsByPort(port);
  if (!pids.length) return;

  console.log(`Encerrando processo(s) na porta ${port}: ${pids.join(', ')}`);
  for (const pid of pids) {
    await execFileAsync('taskkill', ['/PID', pid, '/T', '/F']);
  }
}

async function releasePort(port) {
  if (process.platform === 'win32') {
    await killWindowsPort(port);
    return;
  }

  try {
    const { stdout } = await execFileAsync('lsof', ['-ti', `tcp:${port}`]);
    const pids = stdout.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!pids.length) return;
    console.log(`Encerrando processo(s) na porta ${port}: ${pids.join(', ')}`);
    for (const pid of pids) {
      process.kill(Number(pid), 'SIGTERM');
    }
  } catch {
    // Sem lsof ou sem processos na porta. Seguimos normalmente.
  }
}

function startProcess(name, args) {
  const child = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd', ...args], {
        stdio: 'inherit',
        shell: false
      })
    : spawn('npm', args, {
        stdio: 'inherit',
        shell: false
      });

  children.push(child);

  child.on('exit', code => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopAll(typeof code === 'number' ? code : 1);
  });

  child.on('error', error => {
    if (shuttingDown) return;
    console.error(`[${name}] ${error.message}`);
    shuttingDown = true;
    stopAll(1);
  });
}

function stopAll(exitCode = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGINT');
  }
  setTimeout(() => process.exit(exitCode), 150);
}

process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopAll(0);
});

process.on('SIGTERM', () => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopAll(0);
});

await releasePort(FRONTEND_PORT);

console.log(`Iniciando frontend na porta ${FRONTEND_PORT} e backend na porta 3000...`);
startProcess('frontend', ['run', 'dev']);
startProcess('backend', ['run', 'server']);
