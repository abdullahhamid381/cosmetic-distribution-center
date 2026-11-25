import type { Metadata, Viewport } from 'next';
import './globals.css';
import './workspace.css';
import './workspace-theme.css';
export const metadata: Metadata = {title: 'Distribution Center | HH MEDICS', description: 'Cosmetic distribution ERP and warehouse management', icons: {icon:'/hh-medics-logo.png?v=2',apple:'/hh-medics-app-192.png'}};
export const viewport: Viewport = {themeColor: '#18263f'};
export default function RootLayout({children}:{children:React.ReactNode}) {
 // Browser extensions can add attributes to the document root before hydration.
 return <html lang="en" suppressHydrationWarning><body suppressHydrationWarning>{children}</body></html>;
}
