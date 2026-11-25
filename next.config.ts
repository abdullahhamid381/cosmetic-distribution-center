import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: {'/api/reports/download':['./public/hh-medics-logo.png','./public/report-fonts/*'],'/api/monthly-closing/download':['./public/hh-medics-logo.png','./public/report-fonts/*'],'/api/audit/download':['./public/hh-medics-logo.png','./public/report-fonts/*']},
  experimental: {
    agentUpgrade: 'security',
    // Limit page-data workers on hosts with a shared process and thread quota.
    cpus: 2,
    serverActions: {bodySizeLimit: '6mb'},
  },
};
export default nextConfig;
