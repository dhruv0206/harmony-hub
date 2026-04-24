import { Link, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface BreadcrumbEntry {
  groupLabel: string;
  groupLink: string;
  routes: Record<string, string>;
}

const breadcrumbMap: BreadcrumbEntry[] = [
  {
    groupLabel: "Contracts",
    groupLink: "/contracts",
    routes: {
      "/contracts": "All Contracts",
      "/deal-types": "Deal Types",
      "/signatures": "E-Signatures",
      "/document-templates": "Document Templates",
    },
  },
  {
    groupLabel: "Sales",
    groupLink: "/pipeline",
    routes: {
      "/pipeline": "Pipeline",
      "/leads": "Lead Finder",
      "/campaigns": "Campaigns",
    },
  },
];

export function PageBreadcrumb() {
  const { pathname } = useLocation();

  // Find matching group by checking exact match or prefix (for detail pages like /campaigns/:id)
  for (const entry of breadcrumbMap) {
    for (const [route, label] of Object.entries(entry.routes)) {
      if (pathname === route || pathname.startsWith(route + "/")) {
        return (
          <nav className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
            <Link
              to={entry.groupLink}
              className="hover:text-foreground transition-colors"
            >
              {entry.groupLabel}
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground/70">{label}</span>
          </nav>
        );
      }
    }
  }

  return null;
}
