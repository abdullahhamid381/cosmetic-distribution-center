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
    background_color: '#f3f5f8',
    theme_color: '#18263f',
    icons: [
      {src: '/hh-medics-app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
      {src: '/hh-medics-app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
      {src: '/hh-medics-app-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
    ],
  };
}
