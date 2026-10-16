import type { OverviewTrendPoint } from "@/app/admin/_lib/queries";
import { formatNumber } from "@/app/admin/_lib/format";

/**
 * 近 7 天请求量趋势：手写内联 SVG（柱状 + 折线），不引入任何图表依赖。
 * 配色取自设计 token：柱体用主色，网格与文字用中性色。
 */

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 30, right: 18, bottom: 40, left: 48 };
const PLOT_W = WIDTH - PAD.left - PAD.right;
const PLOT_H = HEIGHT - PAD.top - PAD.bottom;

/** 把最大值抬到「好看」的刻度（1/2/5 × 10ⁿ） */
function niceCeil(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function TrendChart({ data }: { data: OverviewTrendPoint[] }) {
  const points = data.length > 0 ? data : [{ day: "", label: "—", requests: 0 }];
  const rawMax = Math.max(...points.map((point) => point.requests), 0);
  const scaleMax = niceCeil(rawMax);
  const step = PLOT_W / points.length;
  const barWidth = Math.min(40, step * 0.46);

  const yOf = (value: number) => PAD.top + PLOT_H - (value / scaleMax) * PLOT_H;
  const centerX = (index: number) => PAD.left + step * index + step / 2;

  // 小数值时 0/0.5/1 三档刻度会算出重复值（如 scaleMax=1 → [0,1,1]），去重避免 React key 冲突
  const ticks = Array.from(new Set([0, 0.5, 1].map((ratio) => Math.round(scaleMax * ratio))));
  const total = points.reduce((sum, point) => sum + point.requests, 0);

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${centerX(index)} ${yOf(point.requests)}`)
    .join(" ");

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">近 7 天请求量</h2>
          <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
            按 usage_daily 汇总，共 {formatNumber(total)} 次请求
          </p>
        </div>
        <p className="text-[11.5px] text-[var(--muted-foreground)]">单位：次 / 天（UTC 自然日）</p>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="近 7 天每日请求量柱状折线图"
        className="mt-3 w-full"
      >
        {ticks.map((tick, tickIndex) => (
          <g key={`tick-${tick}-${tickIndex}`}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={tick === 0 ? "0" : "4 6"}
            />
            <text
              x={PAD.left - 10}
              y={yOf(tick) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted-foreground)"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}

        {points.map((point, index) => {
          const height = Math.max(point.requests > 0 ? 3 : 0, (point.requests / scaleMax) * PLOT_H);
          return (
            <rect
              key={`bar-${point.day}-${index}`}
              x={centerX(index) - barWidth / 2}
              y={PAD.top + PLOT_H - height}
              width={barWidth}
              height={height}
              rx={6}
              fill="var(--primary)"
              opacity={0.85}
            />
          );
        })}

        <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />

        {points.map((point, index) => (
          <circle
            key={`dot-${point.day}-${index}`}
            cx={centerX(index)}
            cy={yOf(point.requests)}
            r={3.5}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={2}
          />
        ))}

        {points.map((point, index) => (
          <g key={`label-${point.day}-${index}`}>
            <text
              x={centerX(index)}
              y={yOf(point.requests) - 10}
              textAnchor="middle"
              fontSize={11.5}
              fontWeight={600}
              fill="var(--foreground)"
            >
              {formatNumber(point.requests)}
            </text>
            <text
              x={centerX(index)}
              y={HEIGHT - 14}
              textAnchor="middle"
              fontSize={11.5}
              fill="var(--muted-foreground)"
            >
              {point.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
