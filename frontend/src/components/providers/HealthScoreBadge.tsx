import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface HealthScoreBadgeProps {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

function getHealthColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  if (score >= 40) return "text-orange-500";
  return "text-destructive";
}

function getHealthBg(score: number): string {
  if (score >= 80) return "bg-success";
  if (score >= 60) return "bg-warning";
  if (score >= 40) return "bg-orange-500";
  return "bg-destructive";
}

function getRiskLabel(score: number): string {
  if (score >= 80) return "Healthy";
  if (score >= 60) return "Monitor";
  if (score >= 40) return "At Risk";
  return "Critical";
}

export function HealthScoreBadge({ score, size = "sm", showLabel = false }: HealthScoreBadgeProps) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const dotSize = size === "lg" ? "h-4 w-4" : size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  const textSize = size === "lg" ? "text-lg font-bold" : size === "md" ? "text-sm font-semibold" : "text-xs font-medium";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 cursor-default">
          <span className={`${dotSize} rounded-full ${getHealthBg(score)} shrink-0`} />
          <span className={`${textSize} ${getHealthColor(score)}`}>{score}</span>
          {showLabel && (
            <Badge variant="secondary" className={`text-[10px] ${getHealthColor(score)}`}>
              {getRiskLabel(score)}
            </Badge>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Health Score: {score}/100 — {getRiskLabel(score)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function HealthScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? "hsl(142, 76%, 36%)" : score >= 60 ? "hsl(45, 93%, 47%)" : score >= 40 ? "hsl(24, 95%, 53%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth="6" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute text-lg font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

export { getHealthColor, getHealthBg, getRiskLabel };
