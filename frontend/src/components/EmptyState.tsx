import { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText, Building2, Headphones, TrendingUp, UserPlus, Inbox,
  Calendar, CreditCard, Bell, BarChart3, Users, Shield,
  Mail, BookOpen, Megaphone, Scale, Receipt, Search,
} from "lucide-react";

const icons: Record<string, any> = {
  providers: Building2,
  contracts: FileText,
  tickets: Headphones,
  pipeline: TrendingUp,
  onboarding: UserPlus,
  calendar: Calendar,
  billing: CreditCard,
  invoices: Receipt,
  notifications: Bell,
  analytics: BarChart3,
  users: Users,
  documents: FileText,
  signatures: Shield,
  email: Mail,
  training: BookOpen,
  campaigns: Megaphone,
  "law-firms": Scale,
  search: Search,
  default: Inbox,
};

interface EmptyStateProps {
  icon?: string;
  customIcon?: ReactNode;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
}

export function EmptyState({ icon = "default", customIcon, title, description, action, compact }: EmptyStateProps) {
  const Icon = icons[icon] || icons.default;
  
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
          {customIcon || <Icon className="h-5 w-5 text-muted-foreground" />}
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{description}</p>
        {action && (
          <Button size="sm" variant="outline" onClick={action.onClick} className="mt-3">
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          {customIcon || <Icon className="h-8 w-8 text-muted-foreground" />}
        </div>
        <h3 className="text-lg font-semibold mb-1">{title}</h3>
        <p className="text-muted-foreground text-sm max-w-sm mb-4">{description}</p>
        {action && (
          <Button onClick={action.onClick}>{action.label}</Button>
        )}
      </CardContent>
    </Card>
  );
}
