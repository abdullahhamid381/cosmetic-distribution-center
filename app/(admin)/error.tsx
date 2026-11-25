'use client';
import Link from 'next/link';
export default function Error({error,reset}:{error:Error & {digest?:string},reset:()=>void}){
 return <div className="card"><h2>We couldn’t complete that request</h2><p className="muted">{error.message||'An unexpected server error occurred.'}</p><div className="actions"><button className="btn primary" onClick={reset}>Try again</button><Link className="btn" href="/dashboard">Return to dashboard</Link></div></div>;
}
