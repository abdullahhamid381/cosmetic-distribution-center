import {BrandLogo} from '@/components/BrandLogo';
import Link from 'next/link';
import {login} from '../actions';
import {LockKeyhole,ShieldCheck,Boxes} from 'lucide-react';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{error?:string}>}){
 const p=await searchParams;
 return <div className="login-page"><div className="login-side"><BrandLogo className="login-brand-logo"/><h1>Distribution,<br/><em>under control.</em></h1><p>Your products, stock, shops, invoicing and payments in one place.</p><div className="login-feature"><Boxes size={19}/> Real-time warehouse tracking</div><div className="login-feature"><ShieldCheck size={19}/> Role-based secure operations</div><div className="login-side-footer">SCIENCE — BACKED BEAUTY</div></div><section className="login-form-wrap"><form action={login} className="login-card"><BrandLogo className="login-form-logo"/><h2>Welcome back</h2><p>Sign in to your distribution workspace.</p>{p.error&&<div className="alert error" role="alert">{p.error==='unavailable'?'The sign-in service is temporarily unavailable. Please try again shortly.':'Invalid email or password. Please try again.'}</div>}<label>Email address<input type="email" name="email" placeholder="admin@company.com" required autoComplete="username"/></label><label>Password<input type="password" name="password" placeholder="Enter your password" required autoComplete="current-password"/></label><button className="btn primary full" type="submit">Sign in →</button><small><Link href="/agent-login">Sales agent portal sign-in</Link></small><small>Only authorized company staff may access this system.</small><small><Link href="/install">Install mobile app</Link></small></form></section></div>
}
