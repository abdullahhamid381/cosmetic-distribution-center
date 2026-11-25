'use client';

import {useEffect, useRef, useState, type CSSProperties} from 'react';
import {BarChart3} from 'lucide-react';
import {money} from '@/lib/utils';

const compact = new Intl.NumberFormat('en-PK', {notation:'compact', maximumFractionDigits:1});

export function DashboardTrend({activity, daily, allTime}: {
  activity: {bucket:string; sales:string; collected:string}[];
  daily: boolean;
  allTime: boolean;
}) {
  const [active, setActive] = useState<string>();
  const scrollArea = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const chart = scrollArea.current;
    if (chart) chart.scrollLeft = chart.scrollWidth - chart.clientWidth;
  }, []);
  const points = activity.map(({bucket, sales, collected}) => ({
    bucket, sales: Number(sales), collected: Number(collected),
    label: new Date(`${bucket}T12:00:00Z`).toLocaleDateString('en-GB', daily
      ? {day:'numeric', month:'short', timeZone:'UTC'}
      : {month:'short', year:'2-digit', timeZone:'UTC'}),
  }));
  const values = points.flatMap(point => [point.sales, point.collected]);
  const selected = points.find(point => point.bucket === active) ?? points.at(-1);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const rawStep = (high - low) / 4;
  const magnitude = rawStep ? 10 ** Math.floor(Math.log10(rawStep)) : 1;
  const step = ([1, 2, 2.5, 5, 10].find(value => value * magnitude >= rawStep) ?? 10) * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const range = max - min;
  const ticks = range ? Array.from({length: Math.round(range / step) + 1}, (_, index) => min + index * step) : [];
  const position = (value:number) => (value - min) / range * 100;

  return (
    <section className="overview-panel overview-trend">
      <div className="overview-panel-heading">
        <div><h2>Shop sales &amp; collections</h2><p>{allTime ? 'Latest six months' : daily ? 'Daily activity' : 'Monthly activity'} · PKR</p></div>
      </div>
      <div className="overview-legend"><span><i className="sales"/>Invoiced sales</span><span><i className="collections"/>Payments received</span></div>
      {range && selected ? (
        <>
          <div className="overview-chart-reading" aria-live="polite">
            <strong>{selected.label}</strong><span>Sales <b>{money(selected.sales)}</b></span><span>Payments <b>{money(selected.collected)}</b></span>
          </div>
          <div className="overview-chart">
            <div className="overview-axis" aria-hidden="true">{ticks.map(tick => <span key={tick} style={{bottom:`${position(tick)}%`}}>{compact.format(tick)}</span>)}</div>
            <div className="overview-chart-scroll" ref={scrollArea}>
              <div className="overview-plot" style={{'--bucket-count': points.length} as CSSProperties}>
                <div className="overview-gridlines" aria-hidden="true">{ticks.map(tick => <div key={tick} className={Math.abs(tick) < step / 100 ? 'zero' : ''} style={{bottom:`${position(tick)}%`}}/>)}</div>
                {points.map((point, index) => (
                  <button type="button" key={point.bucket} className="overview-bucket" aria-pressed={point.bucket === selected.bucket}
                    aria-label={`${point.label}, invoiced sales ${money(point.sales)}, payments received ${money(point.collected)}`}
                    onClick={() => setActive(point.bucket)}>
                    {([['sales', point.sales], ['collections', point.collected]] as const).map(([series, value]) => (
                      <i key={series} className={series} style={{bottom:`${position(Math.min(0,value))}%`,height:`${Math.abs(value) / range * 100}%`}}/>
                    ))}
                    <span aria-hidden="true">{index % Math.ceil(points.length / 8) === 0 || index === points.length - 1 ? point.label : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="overview-note">Sales use invoice dates. Payments use receipt dates and may apply to earlier invoices.</p>
        </>
      ) : <div className="overview-empty overview-chart-empty"><BarChart3 size={27} aria-hidden="true"/>No invoiced sales or receipts in the chart period.</div>}
    </section>
  );
}
