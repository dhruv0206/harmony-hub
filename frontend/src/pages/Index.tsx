import { useAuth } from "@/contexts/AuthContext";
import AdminDashboard from "./dashboard/AdminDashboard";
import SalesRepDashboard from "./dashboard/SalesRepDashboard";
import ProviderDashboard from "./dashboard/ProviderDashboard";
import LawFirmDashboard from "./dashboard/LawFirmDashboard";

export default function Index() {
  const { role } = useAuth();

  if (role === "admin") return <AdminDashboard />;
  if (role === "sales_rep") return <SalesRepDashboard />;
  if (role === "law_firm") return <LawFirmDashboard />;
  return <ProviderDashboard />;
}
