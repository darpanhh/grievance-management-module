import { useState } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

// Draws the percentage above each bar.  Totals are read from the chart
// options so this plugin can stay registered once at module scope
// (inline plugin props are not reliably re-attached).
const resolvedUnresolvedLabels = {
  id: "resolvedUnresolvedLabels",
  afterDatasetsDraw(chart) {
    const totals = chart.options.plugins?.resolvedUnresolvedLabels;
    if (!totals) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    const colors = chart.data.datasets[0].backgroundColor;
    const font = "'Segoe UI', Roboto, -apple-system, sans-serif";
    meta.data.forEach((bar, index) => {
      const value = chart.data.datasets[0].data[index];
      if (typeof value !== "number" || value <= 0) return;
      const total = totals.resolved + totals.unresolved;
      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
      ctx.save();
      ctx.textAlign = "center";
      ctx.fillStyle = colors[index];
      ctx.font = `700 12px ${font}`;
      ctx.fillText(`${pct}%`, bar.x, bar.y - 12);
      ctx.restore();
    });
  },
};

ChartJS.register(resolvedUnresolvedLabels);

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
          {!hoverItem && (
            <div className="trend-legend">
              <span className="legend-item total"><i /> Total Grievances</span>
              <span className="legend-item resolved"><i /> Resolved</span>
            </div>
          )}
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

const ResolvedUnresolvedGraph = ({ data = {} }) => {
  const [range, setRange] = useState("6m");
  const rangeData = data[range] || {};
  const resolvedCount = Number(rangeData.resolved) || 0;
  const unresolvedCount = Number(rangeData.unresolved) || 0;
  const total = resolvedCount + unresolvedCount;
  const pctOf = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);

  const chartData = {
    labels: ["Resolved", "Unresolved"],
    datasets: [
      {
        data: [resolvedCount, unresolvedCount],
        backgroundColor: ["#10b981", "#6366f1"],
        hoverBackgroundColor: ["#059669", "#4f46e5"],
        borderRadius: 0,
        borderSkipped: false,
        maxBarThickness: 54,
        categoryPercentage: 0.76,
        barPercentage: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    animation: { duration: 600, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      resolvedUnresolvedLabels: { resolved: resolvedCount, unresolved: unresolvedCount },
      tooltip: {
        backgroundColor: "#0f172a",
        padding: 10,
        cornerRadius: 8,
        titleFont: { size: 12, weight: 600 },
        bodyFont: { size: 12 },
        displayColors: true,
        boxPadding: 4,
        callbacks: {
          label: (ctx) => `${ctx.parsed.y} grievance${ctx.parsed.y === 1 ? "" : "s"} (${pctOf(ctx.parsed.y)}%)`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#475569", font: { size: 12, weight: 600 }, padding: 10 },
      },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "rgba(148, 163, 184, 0.22)", drawTicks: false },
        ticks: { color: "#94a3b8", font: { size: 11 }, padding: 8, precision: 0, stepSize: 1 },
      },
    },
  };

  return (
    <article className="admin-chart-card status-chart-card">
      <div className="admin-chart-heading">
        <div>
          <h2>Resolved vs Unresolved</h2>
        </div>
        <div className="trend-header-right">
          <div className="trend-legend">
            <span className="legend-item resolved"><i /> Resolved</span>
            <span className="legend-item total"><i /> Unresolved</span>
          </div>
          <select className="chart-select-dropdown" value={range} onChange={(e) => setRange(e.target.value)} aria-label="Select comparison time range">
            <option value="7d">7 Days</option>
            <option value="15d">15 Days</option>
            <option value="1m">1 Month</option>
            <option value="6m">6 Months</option>
            <option value="1y">1 Year</option>
          </select>
        </div>
      </div>
      {total === 0 ? (
        <p className="empty-note" style={{ padding: "2.5rem 0", textAlign: "center" }}>No grievance data available for this period</p>
      ) : (
        <div className="resolved-unresolved-body" role="img" aria-label={`Resolved vs Unresolved chart: ${resolvedCount} resolved (${pctOf(resolvedCount)}%), ${unresolvedCount} unresolved (${pctOf(unresolvedCount)}%)`}>
          <Bar key={range} data={chartData} options={options} />
        </div>
      )}
    </article>
  );
};

export { CategoryBreakdownGraph, TrendLineGraph, ResolvedUnresolvedGraph };