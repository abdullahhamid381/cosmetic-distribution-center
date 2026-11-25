import Link from 'next/link';
import {ArrowRight, Banknote, Boxes, Wallet} from 'lucide-react';
import {money, formatDate} from '@/lib/utils';
import type {dashboardAnalytics} from '@/lib/dashboard-analytics';
import {DashboardTrend} from './DashboardTrend';

const colors = ['var(--overview-chart-sales)', 'var(--overview-green)', 'var(--overview-chart-other)', 'var(--overview-chart-neutral)'];

export function DistributionAnalytics({data, allTime, reportsHref}: {
  data: Awaited<ReturnType<typeof dashboardAnalytics>>;
  allTime: boolean;
  reportsHref: string;
}) {
  const totalUnits = data.products.reduce((sum, product) => sum + Number(product.units), 0);
  const slices = data.products.slice(0, 3).map(product => ({name: product.name, units: Number(product.units)}));
  const other = totalUnits - slices.reduce((sum, slice) => sum + slice.units, 0);
  if (other > 0) slices.push({name: 'Other products', units: other});
  let offset = 0;
  const stops = slices.map((slice, index) => {
    const start = offset;
    offset += slice.units / totalUnits * 100;
    return `${colors[index]} ${start}% ${offset}%`;
  });
  const topCities = data.cities.slice(0, 5);
  const cityMax = Math.max(1, ...topCities.map(city => Math.abs(Number(city.sales))));
  const shopCount = data.cities.reduce((sum, city) => sum + Number(city.shops), 0);

  return (
    <>
      <div className="overview-grid">
        <DashboardTrend activity={data.activity} daily={data.daily} allTime={allTime}/>
        <section className="overview-panel">
          <div className="overview-panel-heading">
            <div><h2>Product mix</h2><p>Net units distributed to shops</p></div>
            <span className="overview-icon blue"><Boxes size={18} aria-hidden="true"/></span>
          </div>
          {totalUnits ? (
            <>
              <div className="overview-donut" style={{background: `conic-gradient(${stops.join(',')})`}}>
                <div><strong>{new Intl.NumberFormat('en-PK', {notation:'compact', maximumFractionDigits:1}).format(totalUnits)}</strong><small>net units</small></div>
              </div>
              <ul className="overview-mix">
                {slices.map((slice, index) => <li key={index}>
                  <i style={{background: colors[index]}}/><span>{slice.name}</span>
                  <strong>{slice.units.toLocaleString('en-PK')}</strong><small>{(slice.units / totalUnits * 100).toFixed(1)}%</small>
                </li>)}
              </ul>
              <p className="overview-note">{data.products.length.toLocaleString('en-PK')} products distributed. Includes returns to date against invoices in this period.</p>
            </>
          ) : <p className="overview-empty">No net product distributions in this period.</p>}
          <Link className="overview-link overview-panel-link" href={reportsHref}>Product report <ArrowRight size={15}/></Link>
        </section>
      </div>

      <div className="overview-grid overview-grid-even">
        <section className="overview-panel">
          <div className="overview-panel-heading">
            <div><h2>Sales by city</h2><p>{shopCount.toLocaleString('en-PK')} shops invoiced across {data.cities.length} {data.cities.length === 1 ? 'city' : 'cities'}</p></div>
            <Link className="overview-link" href="/shops">Shops <ArrowRight size={15}/></Link>
          </div>
          {topCities.length ? <ol className="overview-ranking">{topCities.map(city => (
            <li key={city.city}>
              <div><strong>{city.city}</strong><b>{money(city.sales)}</b></div>
              <div className="overview-track" aria-hidden="true"><span className={Number(city.sales) < 0 ? 'negative' : undefined} style={{width:`${Math.abs(Number(city.sales)) / cityMax * 100}%`}}/></div>
              <small>{city.shops} {Number(city.shops) === 1 ? 'shop' : 'shops'}</small>
            </li>
          ))}</ol> : <p className="overview-empty">No shop invoices in this period.</p>}
        </section>

        <section className="overview-panel">
          <div className="overview-panel-heading">
            <div><h2>Recent shop payments</h2><p>Receipts recorded in this period</p></div>
            <Link className="overview-link" href="/payments">All payments <ArrowRight size={15}/></Link>
          </div>
          {data.payments.length ? <ul className="overview-list overview-payments">{data.payments.map(payment => {
            const Icon = payment.method.toLowerCase().includes('cash') ? Banknote : Wallet;
            return <li key={payment.id}><Link href={`/payments/${payment.id}/print`}>
              <span className="overview-icon teal"><Icon size={17} aria-hidden="true"/></span>
              <span className="overview-payment-name"><strong>{payment.shop_name}</strong><small>{payment.payment_no} · {payment.method}</small></span>
              <span className="overview-payment-value"><strong>{money(payment.amount)}</strong><small>{formatDate(payment.payment_date)}</small></span>
            </Link></li>;
          })}</ul> : <p className="overview-empty">No shop payments were recorded in this period.</p>}
        </section>
      </div>
    </>
  );
}
