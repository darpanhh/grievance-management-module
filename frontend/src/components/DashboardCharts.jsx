import { useState } from "react";

/* Shared analytics chart components for Campus Admin and Department dashboards. */

const CategoryBreakdownGraph = ({ data = [] }) => {
  const displayItems = [...data].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...displayItems.map((item) => item.count), 1);
  return (
    <article className="admin-chart-card category-chart-card">
      <div className="admin-chart-heading">
        <div>
          <h2>Grievances by Category</h2>
        </div>
      </div>
      <div className="horizontal-chart-body" role="img" aria-label="Grievances by Category chart">
        {displayItems.length === 0 ? (
          <p className="empty-note" style={{ padding: "2rem 0", textAlign: "center" }}>No category data available.</p>
        ) : displayItems.map((cat) => {
          const percent = Math.round((cat.count / maxCount) * 100);
          return (
            <div key={cat.id || cat.name} className="chart-bar-row">
              <div className="chart-bar-label-col" title={cat.name}>{cat.name}</div>
              <div className="chart-bar-track-col">
                <div className="chart-bar-fill" style={{ width: `${Math.max(percent, cat.count > 0 ? 3 : 0)}%` }}>
                  <span className="chart-bar-tooltip">{cat.name}: {cat.count} grievances</span>
                </div>
              </div>
              <div className="chart-bar-val-col"><strong>{cat.count}</strong></div>
            </div>
          );
        })}
      </div>
    </article>
  );
};

const TrendLineGraph = ({ trends = {}, title = "Grievance Trend" }) => {
  const [trendRange, setTrendRange] = useState("6m");
  const [hoverIndex, setHoverIndex] = useState(null);
  const seriesData = trends[trendRange] || [];
  const maxVal = Math.max(...seriesData.map((d) => Math.max(d.total, d.resolved)), 1);
  const width = 700, height = 220, paddingX = 40, paddingY = 25;
  const chartW = width - paddingX * 2, chartH = height - paddingY * 2;
  const count = seriesData.length;
  const pointsTotal = seriesData.map((d, i) => {
    const x = count <= 1 ? width / 2 : paddingX + (i / (count - 1)) * chartW;
    const y = paddingY + chartH - (d.total / maxVal) * chartH;
    return { x, y, data: d };
  });
  const pointsResolved = seriesData.map((d, i) => {
    const x = count <= 1 ? width / 2 : paddingX + (i / (count - 1)) * chartW;
    const y = paddingY + chartH - (d.resolved / maxVal) * chartH;
    return { x, y, data: d };
  });
  const pathTotal = pointsTotal.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, "");
  const pathResolved = pointsResolved.reduce((acc, pt, i) => `${acc} ${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, "");
  const areaTotal = pointsTotal.length > 0
    ? `${pathTotal} L ${pointsTotal[pointsTotal.length - 1].x.toFixed(1)} ${(paddingY + chartH).toFixed(1)} L ${pointsTotal[0].x.toFixed(1)} ${(paddingY + chartH).toFixed(1)} Z`
    : "";
  const gridSteps = [0, 0.33, 0.66, 1];
  const hoverItem = hoverIndex !== null && seriesData[hoverIndex] ? seriesData[hoverIndex] : null;

  return (
    <article className="admin-chart-card trend-chart-card">
      <div className="admin-chart-heading">
        <div className="trend-title-wrap">
          <h2>{title}</h2>
          {hoverItem && (
            <div className="trend-header-hover-pill">
              <span className="pill-date">{hoverItem.label}</span>
              <span className="pill-stat total">Total: <strong>{hoverItem.total}</strong></span>
              <span className="pill-stat resolved">Resolved: <strong>{hoverItem.resolved}</strong></span>
            </div>
          )}
        </div>
        <div className="trend-header-right">
          <div className="trend-legend">
            <span className="legend-item total"><i /> Total Grievances</span>
            <span className="legend-item resolved"><i /> Resolved</span>
          </div>
          <select className="chart-select-dropdown" value={trendRange} onChange={(e) => setTrendRange(e.target.value)} aria-label="Select trend time range">
            <option value="7d">7 Days</option>
            <option value="15d">15 Days</option>
            <option value="1m">1 Month</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
          </select>
        </div>
      </div>
      <div className="trend-chart-wrapper" onMouseLeave={() => setHoverIndex(null)}>
        <svg className="trend-svg" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {gridSteps.map((step, idx) => {
            const y = paddingY + chartH * (1 - step);
            const val = Math.round(maxVal * step);
            return (
              <g key={idx}>
                <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} className="trend-grid-line" />
                <text x={paddingX - 8} y={y + 3} textAnchor="end" className="trend-axis-text">{val}</text>
              </g>
            );
          })}
          {areaTotal && <path d={areaTotal} className="trend-area-total" />}
          {pathTotal && <path d={pathTotal} className="trend-line-total" />}
          {pathResolved && <path d={pathResolved} className="trend-line-resolved" />}
          {hoverIndex !== null && pointsTotal[hoverIndex] && (
            <line x1={pointsTotal[hoverIndex].x} y1={paddingY} x2={pointsTotal[hoverIndex].x} y2={paddingY + chartH} className="trend-hover-line" />
          )}
          {pointsTotal.map((pt, i) => {
            const stepRatio = count > 15 ? Math.ceil(count / 7) : 1;
            const showLabel = i % stepRatio === 0 || i === count - 1;
            const ptRes = pointsResolved[i];
            return (
              <g key={i} onMouseEnter={() => setHoverIndex(i)}>
                <rect x={pt.x - (chartW / count) / 2} y={0} width={chartW / count} height={height} fill="transparent" style={{ cursor: "pointer" }} />
                {showLabel && <text x={pt.x} y={height - 5} textAnchor="middle" className="trend-axis-text">{pt.data.label}</text>}
                <circle cx={pt.x} cy={pt.y} r={hoverIndex === i ? 6 : 4} className="trend-point trend-point-total" />
                {ptRes && <circle cx={ptRes.x} cy={ptRes.y} r={hoverIndex === i ? 6 : 4} className="trend-point trend-point-resolved" />}
              </g>
            );
          })}
        </svg>
      </div>
    </article>
  );
};

export { CategoryBreakdownGraph, TrendLineGraph };