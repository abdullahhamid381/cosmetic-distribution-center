import type {MetadataRoute} from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'HH MEDICS Distribution Center',
    short_name: 'HH MEDICS',
    description: 'Manage sales, warehouse stock, deliveries, and collections.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#18263f',
    theme_color: '#18263f',
    icons: [
      {src: '/hh-medics-launch-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/hh-medics-launch-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/hh-medics-launch-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
}
