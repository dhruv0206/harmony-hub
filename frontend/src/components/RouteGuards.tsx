import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import Auth from "@/pages/Auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <DashboardLayout>{children}</DashboardLayout>;
}

export function AuthRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
}

export function RoleGuard({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { role, userDataLoaded } = useAuth();
  // Wait for the role fetch to complete; otherwise on a fresh page load `role`
  // is briefly null and the guard would redirect admin-only routes to "/".
  if (!userDataLoaded) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
