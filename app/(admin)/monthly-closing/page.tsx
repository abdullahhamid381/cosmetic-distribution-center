import Link from 'next/link';

import {requireRole} from '@/lib/auth';

import {query} from '@/lib/db';

import {sessionHistory,sessionById,sessionPreview,nextSessionStart,firstSessionDate,validScope} from '@/lib/closing-sessions';

import {closingPeriod,nextDate,pakistanToday} from '@/lib/closing-period';

import {collectionClosing} from '@/lib/monthly-financials';

import {MonthlyFinancialDetails} from '@/components/MonthlyFinancialDetails';

import {ClosingSessionButton} from '@/components/ClosingSessionButton';

import {money} from '@/lib/utils';

import {ClosingScopeSelect} from '@/components/ClosingScopeSelect';
import {ClosingDrilldownProvider,ClosingAmount,ClosingDetailRow} from '@/components/ClosingDrilldown';
import type {ClosingDetailKind} from '@/lib/closing-drilldown';

export default async function MonthlyClosing({searchParams}:{searchParams:Promise<{shop?:string;from?:string;to?:string;session?:string;view?:string}>}){

 await requireRole('ADMIN','MANAGER','ACCOUNTS');

 const input=await searchParams,shop=typeof input.shop==='string'?input.shop:'';

 try{validScope(shop);}catch{return <div className="notice" role="alert">Choose a valid shop. <Link href="/monthly-closing">Reset</Link></div>;}

 const [history,shops,first,selected]=await Promise.all([sessionHistory(shop),query('SELECT id,shop_name FROM shops ORDER BY shop_name'),firstSessionDate(shop),typeof input.session==='string'?sessionById(input.session):null]);

 if(input.session&&(!selected||selected.scope_key!==(shop||'0')))return <div className="notice" role="alert">This closing was not found for the selected shop. <Link href={`/monthly-closing?shop=${shop}`}>Open current session</Link></div>;

 const today=pakistanToday(),nextStart=nextSessionStart(history,first);

 const from=selected?.from_date||input.from||nextStart,to=selected?.through_date||input.to||(from>today?from:today);

 const pending=!selected&&!input.from&&!input.to&&from>today;

 let error='';if(!pending)try{closingPeriod(from,to);}catch(e){error=e instanceof Error?e.message:'Choose valid dates.';}

 const saved=Boolean(selected&&input.view!=='live');

 const snapshot=!pending&&!error?(saved?selected!.snapshot:await sessionPreview(from,to,shop)):null;

 const rows=snapshot?.statements||[],finance=snapshot?collectionClosing(snapshot.financials):null;

 const total=(key:'opening'|'currentSales'|'previousRemaining'|'currentRemaining'|'closing')=>rows.reduce((sum,s)=>sum+s[key],0);

 const base=new URLSearchParams({shop,from,to,...(selected?{session:selected.id}:{}),...(input.view==='live'?{view:'live'}:{})});

 const last=history.find(s=>s.status==='CLOSED');

 return <><div className="page-title-row"><div className="page-title"><span className="eyebrow">FINANCE / CLOSING SESSIONS</span><h1>Closing summaries</h1><p>Close any date range. The next session starts automatically on the following date.</p></div><div className="actions">{snapshot&&<><a className="btn primary" href={`/api/monthly-closing/download?${base}&format=pdf`}>Download PDF</a><a className="btn outline" href={`/api/monthly-closing/download?${base}&format=docx`}>Word (.docx)</a></>}<Link className="btn outline" href="/payments">Collect payment</Link></div></div>

 <section className="card"><form method="get" action="/monthly-closing" className="form-grid"><div className="field"><label htmlFor="session-shop">Shop / reporting scope</label><ClosingScopeSelect shop={shop} shops={shops.map(s=>({id:String(s.id),name:String(s.shop_name)}))}/></div><div className="field"><label htmlFor="session-from">From date</label><input id="session-from" name="from" type="date" min="2000-01-01" defaultValue={from}/></div><div className="field"><label htmlFor="session-to">Through date (included)</label><input id="session-to" name="to" type="date" min="2000-01-01" max={today} defaultValue={to}/></div><div className="form-actions"><button className="btn primary">Show summary</button><Link className="btn outline" href={`/monthly-closing?shop=${shop}`}>Current session</Link></div></form><p className="card-sub">Pakistan dates · Both dates included. Each shop and All shops have separate reporting sessions. Changing the shop opens its current session automatically.</p></section>

 {pending&&<div className="notice section-gap"><b>Next session starts on {from}.</b> The last summary is closed through {last?.through_date}. Its unpaid balance of {money(-(last?.snapshot.statements||[]).reduce((sum,s)=>sum+s.closing,0))} carries forward. This session will be available when that date begins. You can view or reopen a saved summary below.</div>}

 {pending&&last&&<section className="card section-gap"><div className="card-header"><div><h2>Opening balances for {from}</h2><p className="card-sub">Brought forward from the saved closing through {last.through_date}. Payments dated after that closing appear as payment credits when the next session opens.</p></div></div><div className="table-wrap"><table><thead><tr><th>Shop</th><th className="align-right">Previous unpaid carried forward</th></tr></thead><tbody>{last.snapshot.statements.map(s=><tr key={s.shopId}><td><Link href={`/shops/${s.shopId}`}>{s.shopName}</Link></td><td className="align-right money-negative">{money(-s.closing)}</td></tr>)}</tbody><tfoot><tr><th>Total opening unpaid</th><th className="align-right money-negative">{money(-last.snapshot.statements.reduce((sum,s)=>sum+s.closing,0))}</th></tr></tfoot></table></div><Link className="btn outline" href={`/monthly-closing?${new URLSearchParams({shop,session:last.id})}`}>View previous closing and payments</Link></section>}

 {error&&<div className="notice section-gap" role="alert">{error}</div>}

 {snapshot&&<ClosingDrilldownProvider statements={rows} financials={finance} from={from} to={to} shop={shop} saved={saved} previousSession={history.find(s=>s.status==='CLOSED'&&s.through_date<from)?.id}><div className="card section-gap"><div className="card-header"><div><h2>{from} to {to}</h2><p className="card-sub">{saved?`Saved by ${selected!.staff} at ${selected!.closed_at} PKT. ${selected!.status==='REOPENED'?'Archived snapshot of a reopened session.':'Closed summary.'}`:'Live session. Closing saves these records and starts the next session on '+nextDate(to)+'.'}</p></div><div className="actions">{selected&&<Link className="btn outline" href={`/monthly-closing?${new URLSearchParams({shop,session:selected.id,view:input.view==='live'?'':'live'})}`}>{saved?'Compare live records':'Show saved summary'}</Link>}</div></div><div className="stats-grid closing-stats">{[['Previous unpaid opening',-total('opening'),'opening'],['Invoices in this period',total('currentSales'),'sales'],['Previous invoices pending',-total('previousRemaining'),'previousPending'],['Current invoices pending',-total('currentRemaining'),'currentPending'],[`Carry to ${nextDate(to)}`,-total('closing'),'carry']].map(([label,value,kind])=><ClosingAmount className="card stat closing-stat-trigger" kind={kind as ClosingDetailKind} key={String(label)}><span className="stat-top">{label}</span><strong className={Number(value)<0?'money-negative':''}>{money(Number(value))}</strong><small>View invoices ↗</small></ClosingAmount>)}</div><p className="notice">Unpaid amounts remain negative and carry into the next session. Payments on previous and current invoices are positive payment credits that reduce unpaid balances. Return credits are shown separately. Later receipts improve the result when received. Goods costs and expenses are charged only in their own period. Corrections remain allowed; differences from the prior saved summary appear as opening adjustments.</p>

 <div className="table-wrap"><table><thead><tr><th>Shop</th><th>Opening unpaid</th><th>Invoices</th><th>Payment credit on previous</th><th>Payment credit on current</th><th>Return credits</th><th>Pending carried forward</th></tr></thead><tbody>{rows.map(s=><ClosingDetailRow key={s.shopId} shopId={s.shopId}><td><Link href={`/shops/${s.shopId}`}>{s.shopName}</Link></td><td><ClosingAmount kind="opening" shopId={s.shopId}>{money(-s.opening)}</ClosingAmount>{s.openingAdjustment!==0&&<div className="muted">Opening adjustment: <ClosingAmount kind="adjustment" shopId={s.shopId}>{money(-s.openingAdjustment)}</ClosingAmount></div>}</td><td><ClosingAmount kind="sales" shopId={s.shopId}>{money(s.currentSales)}</ClosingAmount></td><td className="money-positive"><ClosingAmount kind="previousReceipts" shopId={s.shopId}>{money(s.previousReceived)}</ClosingAmount></td><td className="money-positive"><ClosingAmount kind="currentReceipts" shopId={s.shopId}>{money(s.currentReceived)}</ClosingAmount></td><td><ClosingAmount kind="credits" shopId={s.shopId}>{money(s.previousCredits+s.currentCredits)}</ClosingAmount></td><td className="money-negative"><ClosingAmount kind="carry" shopId={s.shopId}>{money(-s.closing)}</ClosingAmount></td></ClosingDetailRow>)}</tbody></table>{!rows.length&&<div className="empty">No invoice activity or balances in this period.</div>}</div>

 <div className="section-gap">{selected?.status==='CLOSED'?<ClosingSessionButton key={selected.id} session={selected.id} shop={shop} from={from} to={to}/>:!selected&&<ClosingSessionButton key={`${shop}:${from}:${to}`} shop={shop} from={from} to={to}/>}</div></div>

 {finance&&<MonthlyFinancialDetails invoiceLinks={Object.fromEntries(rows.flatMap(s=>s.invoices.map(i=>[i.invoice_no,i.id])))} data={finance} saved={saved} currentPending={total('currentRemaining')} previousReceived={rows.reduce((sum,s)=>sum+s.previousReceived,0)} previousCredits={rows.reduce((sum,s)=>sum+s.previousCredits,0)}/>}

 <div className="stack section-gap">{rows.map(s=><details className="card" key={s.shopId}><summary className="closing-detail-title">{s.shopName} — invoice breakdown</summary><div className="table-wrap section-gap"><table><thead><tr><th>Invoice</th><th>Issue date</th><th>Period</th><th>Opening unpaid</th><th>Received</th><th>Return credits</th><th>Pending</th></tr></thead><tbody>{s.invoices.map(i=><tr key={i.id}><td><Link href={`/invoices/${i.id}`}>{i.invoice_no}</Link></td><td>{i.issue_date}</td><td>{i.issue_date<from?'Previous':'Current'}</td><td><Link href={`/invoices/${i.id}`}>{money(-Number(i.opening))}</Link></td><td><Link href={`/invoices/${i.id}`}>{money(i.received)}</Link></td><td><Link href={`/invoices/${i.id}`}>{money(i.credits)}</Link></td><td><Link href={`/invoices/${i.id}`}>{money(-Number(i.closing))}</Link></td></tr>)}</tbody></table></div></details>)}</div></ClosingDrilldownProvider>}

 <section className="card section-gap"><h2>Closing session history</h2><div className="table-wrap section-gap"><table><thead><tr><th>Session</th><th>From</th><th>Through</th><th>Status</th><th>Closed by / time (PKT)</th><th>Reopening detail</th><th></th></tr></thead><tbody>{history.map(s=><tr key={s.id}><td>#{s.id}</td><td>{s.from_date}</td><td>{s.through_date}</td><td><span className={`badge ${s.status==='CLOSED'?'blue':'pending'}`}>{s.status}</span></td><td>{s.staff}<div className="muted">{s.closed_at}</div></td><td>{s.reopened_at?<>{s.reopened_by_name}<div>{s.reopened_at}</div>{s.reopen_reason||'No reason entered'}</>:'—'}</td><td><Link className="btn outline" href={`/monthly-closing?${new URLSearchParams({shop,session:s.id})}`}>View summary</Link></td></tr>)}</tbody></table>{!history.length&&<div className="empty">No saved sessions yet.</div>}</div></section>

 </>;

}

