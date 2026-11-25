import Link from 'next/link';
import {
  ArrowRight, CircleAlert, Download, PackagePlus, Plus, ReceiptText, ShoppingBag,
  TrendingUp, Wallet,
} from 'lucide-react';
import {DashboardPeriodSelect} from '@/components/DashboardPeriodSelect';
import {DistributionAnalytics} from '@/components/DistributionAnalytics';
import {requireRole} from '@/lib/auth';
import {dashboardTotals, shopBalances} from '@/lib/data';
import {dashboardAnalytics} from '@/lib/dashboard-analytics';
import {dashboardActivity} from '@/lib/dashboard-data';
import {dashboardPeriod} from '@/lib/dashboard-period';
import {query} from '@/lib/db';
import {cents, formatDate, money} from '@/lib/utils';
import './dashboard.css';

export default async function Dashboard({searchParams}: {
  searchParams: Promise<{period?: string}>;
}) {
  const user = await requireRole('ADMIN', 'MANAGER', 'ACCOUNTS');
  const range = dashboardPeriod((await searchParams).period);
  const dates = {from: range.from ?? '', to: range.to};
  const [base, activity, invoices, shops, alerts, analytics] = await Promise.all([
    dashboardTotals(),
    dashboardActivity(range.from, range.to),
    query(`SELECT i.id,i.invoice_no,i.total,i.paid_total,i.credit_total,
      to_char(i.issue_date,'YYYY-MM-DD') AS issue_date,s.shop_name
      FROM invoices i JOIN shops s ON s.id=i.shop_id
      WHERE ($1::date IS NULL OR i.issue_date >= $1) AND i.issue_date <= $2::date
      ORDER BY i.issue_date DESC,i.id DESC LIMIT 6`, [range.from, range.to]),
    shopBalances(),
    query(`SELECT p.id,p.name,p.sku,p.min_stock,COALESCE(SUM(b.quantity_on_hand),0) AS available
      FROM products p LEFT JOIN batches b ON b.product_id=p.id GROUP BY p.id
      HAVING COALESCE(SUM(b.quantity_on_hand),0)<=p.min_stock ORDER BY available,p.id LIMIT 6`),
    dashboardAnalytics(range.from, range.to, range.period),
  ]);
  const profit = Number(activity.gross_before_returns) - Number(activity.return_credit)
    + Number(activity.returned_costs ?? 0) - Number(activity.expenses) + Number(activity.local_profit ?? 0);
  const metrics = [
    {label:'Total sales', value:money(Number(activity.sales) + Number(activity.local_sales ?? 0)), detail:'Shop invoices and local sales', icon:ShoppingBag, tone:'blue'},
    {label:'Net collections', value:money(Number(activity.collected) + Number(activity.local_collected ?? 0)), detail:'Shop receipts and net local collections', icon:Wallet, tone:'teal'},
    {label:'Profit after expenses', value:money(profit), detail:'Includes unpaid sales', icon:TrendingUp, tone:'blue'},
    {label:'Outstanding balances', value:money(base.pending), detail:'Current shop invoice balances', icon:ReceiptText, tone:'blue'},
  ];
  const outstandingShops = shops.filter(shop => Number(shop.pending) > 0).slice(0, 7);
  const canManageStock = user.role !== 'ACCOUNTS';

  return (
    <div className="overview">
      <header className="overview-heading">
        <div>
          <h1>Distribution Overview</h1>
          <p>Monitor sales, inventory, distribution, and financial performance.</p>
          <p className="overview-period">{range.from && range.from !== range.to ? `${formatDate(range.from)} – ` : range.from ? '' : 'Through '}{formatDate(range.to)}</p>
        </div>
        <div className="overview-actions">
          <DashboardPeriodSelect period={range.period}/>
          {canManageStock && <>
            <Link className="overview-action" href="/inventory#receive-stock"><PackagePlus size={16}/> Receive stock</Link>
            <Link className="overview-action" href="/sales/new"><Plus size={16}/> Create sale</Link>
          </>}
          <Link className="overview-download" href={`/api/export?${new URLSearchParams({kind:'report', ...dates})}`}>
            <Download size={17}/> Export report
          </Link>
        </div>
      </header>

      <section className="overview-kpis" aria-label="Key metrics">
        {metrics.map(({label,value,detail,icon:Icon,tone}) => (
          <article className="overview-panel overview-kpi" key={label}>
            <div className="overview-kpi-top">
              <span className={`overview-icon ${tone}`}><Icon size={19} aria-hidden="true"/></span>
              <h2>{label}</h2>
            </div>
            <strong>{value}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <DistributionAnalytics key={range.period} data={analytics} allTime={range.period === 'all'}
        reportsHref={`/reports?${new URLSearchParams({...dates, view:'products'})}`}/>

      <dl className="overview-panel overview-financials">
        <div><dt>Business expenses</dt><dd>{money(activity.expenses)}</dd></div>
        <div><dt>Return credits</dt><dd>{money(Number(activity.return_credit) + Number(activity.local_return_credit ?? 0))}</dd></div>
        <div><dt>Current warehouse units</dt><dd>{Number(base.units).toLocaleString('en-PK')}</dd></div>
      </dl>

      <div className="overview-grid">
        <section className="overview-panel">
          <div className="overview-panel-heading">
            <div><h2>Recent invoices</h2><p>Invoices issued in this period and their current status</p></div>
            <Link className="overview-link" href="/invoices">All invoices <ArrowRight size={15}/></Link>
          </div>
          {invoices.length ? (
            <div className="overview-table" role="region" aria-label="Recent invoices" tabIndex={0}>
              <table>
                <thead><tr><th>Invoice</th><th>Shop</th><th>Date</th><th className="amount">Total</th><th>Status</th></tr></thead>
                <tbody>{invoices.map(invoice => {
                  const settled = cents(Number(invoice.total) - Number(invoice.paid_total) - Number(invoice.credit_total)) <= 0;
                  return <tr key={invoice.id}>
                    <td><Link href={`/invoices/${invoice.id}`}>{invoice.invoice_no}</Link></td>
                    <td>{invoice.shop_name}</td><td className="overview-date">{formatDate(invoice.issue_date)}</td>
                    <td className="amount">{money(invoice.total)}</td>
                    <td><span className={`overview-status ${settled ? 'teal' : 'amber'}`}>{settled ? 'Settled' : 'Pending'}</span></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <p className="overview-empty">No invoices were issued in this period.</p>}
        </section>

        <section className="overview-panel">
          <div className="overview-panel-heading">
            <div><h2>Low stock alerts</h2><p>Products at or below minimum stock</p></div>
            <span className="overview-icon amber"><CircleAlert size={18} aria-hidden="true"/></span>
          </div>
          {alerts.length ? <ul className="overview-list">{alerts.map(alert => (
            <li key={alert.id}><div><strong>{alert.name}</strong><small>{alert.sku} · Min. {alert.min_stock}</small></div>
              <span className="overview-status amber">{alert.available} units</span></li>
          ))}</ul> : <p className="overview-empty">No products are at or below minimum stock.</p>}
          {canManageStock && <Link className="overview-link overview-panel-link" href="/inventory">Manage stock <ArrowRight size={15}/></Link>}
        </section>
      </div>

      <section className="overview-panel">
        <div className="overview-panel-heading">
          <div><h2>Top outstanding shop balances</h2><p>Current balances across all invoice dates</p></div>
          <Link className="overview-link" href="/shops">Shop ledgers <ArrowRight size={15}/></Link>
        </div>
        {outstandingShops.length ? (
          <div className="overview-table" role="region" aria-label="Outstanding shop balances" tabIndex={0}>
            <table>
              <thead><tr><th>Shop</th><th>City</th><th>Discount</th><th className="amount">Invoiced</th><th className="amount">Outstanding</th></tr></thead>
              <tbody>{outstandingShops.map(shop => <tr key={shop.id}>
                <td><Link href={`/shops/${shop.id}`}>{shop.shop_name}</Link></td><td>{shop.city || '—'}</td>
                <td>{shop.default_discount == null ? 'Product trade price' : `${shop.default_discount}%`}</td>
                <td className="amount">{money(shop.sales)}</td><td className="amount overview-outstanding">{money(shop.pending)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <p className="overview-empty">No shops currently have an outstanding balance.</p>}
      </section>
    </div>
  );
}
