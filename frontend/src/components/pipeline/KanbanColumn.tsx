import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import KanbanCard from "./KanbanCard";

interface KanbanColumnProps {
  stage: string;
  label: string;
  colorClass: string;
  deals: any[];
  totalValue: number;
  onDealClick: (deal: any) => void;
}

export default function KanbanColumn({
  stage,
  label,
  colorClass,
  deals,
  totalValue,
  onDealClick,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div className="min-w-[260px] flex-shrink-0">
      <div
        ref={setNodeRef}
        className={`rounded-lg border border-t-4 ${colorClass} bg-card h-full transition-colors duration-200 ${
          isOver ? "ring-2 ring-primary/40 bg-accent/30" : ""
        }`}
      >
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{label}</h3>
            <Badge variant="secondary" className="text-xs">
              {deals.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            ${totalValue.toLocaleString()}
          </p>
        </div>
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="p-2 space-y-2 min-h-[100px]">
            {deals.map((deal) => (
              <KanbanCard
                key={deal.id}
                deal={deal}
                onClick={() => onDealClick(deal)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
