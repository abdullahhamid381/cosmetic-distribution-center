import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// Set this before Next.js loads its native compiler or forks build workers.
const env = {
  ...process.env,
  TOKIO_WORKER_THREADS: process.env.TOKIO_WORKER_THREADS ?? '2',
  NEXT_DEPLOYMENT_ID: process.env.NEXT_DEPLOYMENT_ID || randomUUID(),
};
const build = spawnSync(process.execPath, [
  require.resolve('next/dist/bin/next'), 'build', ...process.argv.slice(2),
], {env, stdio: 'inherit'});

if (build.error) console.error(build.error.message);
if (build.signal) console.error(`Next.js build terminated by ${build.signal}.`);
process.exitCode = build.status ?? 1;
