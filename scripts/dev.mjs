import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const hostname = '127.0.0.1';
const port = '3000';
const args = process.argv.slice(2);

async function isAppRunning() {
  try {
    const response = await fetch(`http://${hostname}:${port}/login`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok && (await response.text()).includes('Sign in to your distribution workspace.');
  } catch {
    return false;
  }
}

if (args.length === 0 && await isAppRunning()) {
  console.log('HH Medics is already running. Open localhost:3000 in your browser.');
} else {
  const server = spawn(process.execPath, [
    require.resolve('next/dist/bin/next'), 'dev', '--hostname', hostname, '--port', port, ...args,
  ], { stdio: 'inherit' });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.kill(signal));
  }
  server.on('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
