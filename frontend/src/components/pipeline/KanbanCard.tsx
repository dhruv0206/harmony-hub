import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";

interface KanbanCardProps {
  deal: any;
  onClick: () => void;
  overlay?: boolean;
}

const KanbanCard = memo(function KanbanCard({ deal, onClick, overlay }: KanbanCardProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: deal.id, data: { deal }, disabled: overlay });

  const style = overlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition: transition || "transform 200ms ease",
    opacity: isDragging ? 0.4 : 1,
  };

  const estimatedMonthlyFee = deal.estimated_monthly_fee != null ? Number(deal.estimated_monthly_fee) : null;
  const displayName = deal._displayName || deal.providers?.business_name || "Unknown";

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={overlay ? undefined : onClick}
      className={`rounded-md border bg-background p-3 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? "shadow-lg ring-2 ring-primary/30" : "hover:shadow-sm"
      } ${overlay ? "shadow-xl rotate-2 scale-105 ring-2 ring-primary/40" : ""}`}
    >
      <p className="text-sm font-medium truncate">{displayName}</p>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs font-semibold">
          ${Number(deal.estimated_value || 0).toLocaleString()}
        </span>
        <span className="text-xs text-muted-foreground">{deal.probability}%</span>
      </div>
      {estimatedMonthlyFee != null && estimatedMonthlyFee > 0 && (
        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
          <DollarSign className="h-3 w-3" />
          <span>${estimatedMonthlyFee.toLocaleString()}/mo est.</span>
        </div>
      )}
      {/* Render badges - works for both provider deal_types and law firm badges */}
      {deal._badges && deal._badges.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {deal._badges.map((b: any, i: number) => (
            <Badge
              key={i}
              variant="outline"
              className="text-[10px]"
              style={b.color ? { borderColor: b.color, color: b.color } : undefined}
            >
              {b.label}
            </Badge>
          ))}
        </div>
      ) : deal.deal_types ? (
        <Badge
          variant="outline"
          className="mt-1.5 text-[10px]"
          style={{ borderColor: (deal.deal_types as any).color, color: (deal.deal_types as any).color }}
        >
          {(deal.deal_types as any).name}
        </Badge>
      ) : null}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-muted-foreground">
          {deal.expected_close_date || "No close date"}
        </span>
        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
          {deal._repInitial || deal.profiles?.full_name?.charAt(0) || "?"}
        </div>
      </div>
    </div>
  );
});

export default KanbanCard;
