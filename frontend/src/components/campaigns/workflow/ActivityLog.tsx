import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Phone, MessageSquare, ArrowRightLeft, FileText, UserPlus, XCircle, RefreshCw, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";

const ICON_MAP: Record<string, React.ElementType> = {
  call: Phone,
  note: MessageSquare,
  stage_change: ArrowRightLeft,
  status_change: ArrowRightLeft,
  qualification: FileText,
  deal_selected: FileText,
  term_sheet_sent: FileText,
  term_sheet_accepted: FileText,
  contracts_sent: FileText,
  document_signed: FileText,
  converted: UserPlus,
  marked_dead: XCircle,
  revived: RefreshCw,
  voicemail: Phone,
  email: MessageSquare,
};

interface Props {
  leadId: string;
}

export default function ActivityLog({ leadId }: Props) {
  const [open, setOpen] = useState(false);

  const { data: activities } = useQuery({
    queryKey: ["campaign-activities", leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_activities")
        .select("*, profiles:performed_by(full_name)")
        .eq("campaign_lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between text-sm" size="sm">
          Activity Log ({activities?.length || 0})
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
          {activities?.map((a: any) => {
            const Icon = ICON_MAP[a.activity_type] || MessageSquare;
            return (
              <div key={a.id} className="flex gap-2 text-xs border-l-2 border-muted pl-3 py-1">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-foreground">{a.description}</p>
                  <p className="text-muted-foreground">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                    {a.profiles?.full_name && ` · ${a.profiles.full_name}`}
                  </p>
                </div>
              </div>
            );
          })}
          {(!activities || activities.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-2">No activity yet</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
