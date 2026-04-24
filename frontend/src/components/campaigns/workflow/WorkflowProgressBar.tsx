import { Check, X } from "lucide-react";
import { WORKFLOW_STAGES, STAGE_INDEX, type WorkflowStage } from "./types";

interface Props {
  currentStage: WorkflowStage;
  deadAtStage?: string | null;
}

export default function WorkflowProgressBar({ currentStage, deadAtStage }: Props) {
  const isDead = currentStage === 'dead';
  const activeIndex = isDead
    ? STAGE_INDEX[deadAtStage || 'call_attempt'] ?? 0
    : STAGE_INDEX[currentStage] ?? 0;

  return (
    <div className="px-2 py-3">
      <div className="flex items-center justify-between relative">
        {/* connecting line */}
        <div className="absolute top-3 left-4 right-4 h-0.5 bg-muted" />
        <div
          className="absolute top-3 left-4 h-0.5 transition-all duration-500"
          style={{
            width: `${(activeIndex / (WORKFLOW_STAGES.length - 1)) * 100}%`,
            maxWidth: 'calc(100% - 2rem)',
            backgroundColor: isDead ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
          }}
        />

        {WORKFLOW_STAGES.map((stage, i) => {
          const isCompleted = !isDead && i < activeIndex;
          const isCurrent = !isDead && i === activeIndex;
          const isDeadHere = isDead && i === activeIndex;

          return (
            <div key={stage.key} className="flex flex-col items-center relative z-10" style={{ width: `${100 / WORKFLOW_STAGES.length}%` }}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  isDeadHere
                    ? 'bg-destructive border-destructive text-destructive-foreground'
                    : isCompleted
                    ? 'bg-green-500 border-green-500 text-white'
                    : isCurrent
                    ? 'bg-primary border-primary text-primary-foreground animate-pulse'
                    : 'bg-background border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {isDeadHere ? <X className="h-3 w-3" /> : isCompleted ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`text-[9px] mt-1 text-center leading-tight ${
                isCurrent ? 'text-primary font-semibold' : 'text-muted-foreground'
              }`}>
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
