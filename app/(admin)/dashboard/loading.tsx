import './dashboard.css';

export default function DashboardLoading() {
  return (
    <div className="overview" aria-busy="true" aria-label="Loading distribution overview">
      <div className="overview-heading"><h1>Distribution Overview</h1></div>
      <div className="overview-kpis" aria-hidden="true">
        {Array.from({length:4}, (_, index) => (
          <div className="overview-panel overview-kpi" key={index}>
            <span className="overview-skeleton overview-skeleton-short"/>
            <span className="overview-skeleton overview-skeleton-value"/>
          </div>
        ))}
      </div>
      <div className="overview-grid" aria-hidden="true">
        <div className="overview-panel"><span className="overview-skeleton overview-skeleton-chart"/></div>
        <div className="overview-panel"><span className="overview-skeleton overview-skeleton-chart"/></div>
      </div>
    </div>
  );
}
