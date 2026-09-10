/**
 * StatCard — a single metric tile for the analytics dashboard.
 *
 * Props:
 *   label      — short descriptor above the value
 *   value      — formatted string to display prominently
 *   sub        — optional secondary line (e.g., a breakdown or unit)
 *   accent     — colour variant: "default" | "success" | "warning" | "danger"
 */

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: "default" | "success" | "warning" | "danger";
}

export default function StatCard({
  label,
  value,
  sub,
  accent = "default",
}: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${accent}`} aria-label={label}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
