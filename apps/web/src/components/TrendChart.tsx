/**
 * TrendChart — pure SVG sparkline of daily USDC volume.
 * No external charting dependencies.
 *
 * Props:
 *   data     — array of { date, usdc } ordered oldest → newest
 *   height   — SVG height in px (default 80)
 */

import type { DailyVolume } from "@/hooks/useAnalytics";

interface TrendChartProps {
  data: DailyVolume[];
  height?: number;
}

const PADDING = { top: 8, right: 4, bottom: 24, left: 4 };

export default function TrendChart({ data, height = 80 }: TrendChartProps) {
  const width = 100; // viewBox units — scales with container

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const maxVal = Math.max(...data.map((d) => d.usdc), 0.0001); // avoid /0
  const n = data.length;

  // Map each point to SVG coordinates
  const points = data.map((d, i) => {
    const x = PADDING.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = PADDING.top + innerH - (d.usdc / maxVal) * innerH;
    return { x, y, d };
  });

  // Build polyline points string
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill path: line from first point, down, across bottom, back up
  const firstP = points[0];
  const lastP = points[points.length - 1];
  const areaPath =
    n > 0
      ? `M ${firstP.x},${firstP.y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x},${p.y}`)
          .join(" ") +
        ` L ${lastP.x},${PADDING.top + innerH}` +
        ` L ${firstP.x},${PADDING.top + innerH} Z`
      : "";

  // X-axis label: first and last date (shortened)
  const firstDate = data[0]?.date?.slice(5) ?? ""; // "MM-DD"
  const lastDate = data[data.length - 1]?.date?.slice(5) ?? "";

  const allZero = data.every((d) => d.usdc === 0);

  return (
    <figure className="trend-chart" aria-label="Daily volume trend">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        className="trend-svg"
      >
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Zero baseline */}
        <line
          x1={PADDING.left}
          y1={PADDING.top + innerH}
          x2={PADDING.left + innerW}
          y2={PADDING.top + innerH}
          stroke="var(--border)"
          strokeWidth="0.5"
        />

        {allZero ? (
          /* Flat line when no data */
          <line
            x1={PADDING.left}
            y1={PADDING.top + innerH / 2}
            x2={PADDING.left + innerW}
            y2={PADDING.top + innerH / 2}
            stroke="var(--border)"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
        ) : (
          <>
            {/* Area fill */}
            <path d={areaPath} fill="url(#trendGrad)" />
            {/* Line */}
            <polyline
              points={polyline}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* End dot */}
            {lastP && (
              <circle
                cx={lastP.x}
                cy={lastP.y}
                r="1.8"
                fill="var(--accent)"
              />
            )}
          </>
        )}

        {/* X-axis date labels */}
        {firstDate && (
          <text
            x={PADDING.left}
            y={height - 4}
            fontSize="5"
            fill="var(--muted)"
            textAnchor="start"
          >
            {firstDate}
          </text>
        )}
        {lastDate && (
          <text
            x={PADDING.left + innerW}
            y={height - 4}
            fontSize="5"
            fill="var(--muted)"
            textAnchor="end"
          >
            {lastDate}
          </text>
        )}
      </svg>
      <figcaption className="trend-caption">
        Daily USDC volume — last 30 days
      </figcaption>
    </figure>
  );
}
