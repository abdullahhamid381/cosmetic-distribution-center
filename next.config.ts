import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { existsSync, readFileSync } from 'node:fs';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {'/api/field/pdf/*/*':['./public/hh-medics-logo.png','./public/report-fonts/*'],'/api/reports/download':['./public/hh-medics-logo.png','./public/report-fonts/*'],'/api/monthly-closing/download':['./public/hh-medics-logo.png','./public/report-fonts/*'],'/api/audit/download':['./public/hh-medics-logo.png','./public/report-fonts/*']},
  experimental: {
    agentUpgrade: 'security',
    // Limit page-data workers on hosts with a shared process and thread quota.
    cpus: 2,
    serverActions: {bodySizeLimit: '6mb'},
  },
};
export default function config(phase: string): NextConfig {
  const buildManifest = '.next/required-server-files.json';
  if (phase !== PHASE_PRODUCTION_SERVER || process.env.NEXT_DEPLOYMENT_ID || !existsSync(buildManifest)) {
    return nextConfig;
  }
  const {config: builtConfig} = JSON.parse(readFileSync(buildManifest, 'utf8')) as {config: NextConfig};
  return {...nextConfig, deploymentId: builtConfig.deploymentId};
}
