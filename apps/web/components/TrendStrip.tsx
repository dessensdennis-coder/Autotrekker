import type { ModelTrend } from "@/lib/data";
import { MODEL_LABELS, formatPct } from "@/lib/format";

const ARROWS: Record<string, string> = { up: "▲", down: "▼", stable: "→" };

export function TrendStrip({ trends }: { trends: ModelTrend[] }) {
  if (trends.length === 0) return null;

  return (
    <div className="trend-strip">
      {trends.map((trend) => (
        <span key={trend.model} className="trend-pill">
          {MODEL_LABELS[trend.model] ?? trend.model}
          {trend.direction && (
            <span className={`trend-${trend.direction}`}>
              {ARROWS[trend.direction]} {formatPct(trend.changePct)}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
