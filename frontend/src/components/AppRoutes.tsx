import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute, AuthRoute, RoleGuard } from "@/components/RouteGuards";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import Index from "@/pages/Index";
import NotFound from "@/pages/NotFound";

// Lazy-loaded pages
const Providers = lazy(() => import("@/pages/Providers"));
const ProviderDetail = lazy(() => import("@/pages/ProviderDetail"));
const Contracts = lazy(() => import("@/pages/Contracts"));
const ContractCreate = lazy(() => import("@/pages/ContractCreate"));
const ContractDetail = lazy(() => import("@/pages/ContractDetail"));
const ContractReviewPage = lazy(() => import("@/pages/ContractReviewPage"));
const DealTypes = lazy(() => import("@/pages/DealTypes"));
const Pipeline = lazy(() => import("@/pages/Pipeline"));
const HelpDesk = lazy(() => import("@/pages/HelpDesk"));
const TicketDetail = lazy(() => import("@/pages/TicketDetail"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const MapView = lazy(() => import("@/pages/MapView"));
const OnboardingQueue = lazy(() => import("@/pages/OnboardingQueue"));
const OnboardingDetail = lazy(() => import("@/pages/OnboardingDetail"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const Support = lazy(() => import("@/pages/Support"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const SigningPage = lazy(() => import("@/pages/SigningPage"));
const SignaturesPage = lazy(() => import("@/pages/SignaturesPage"));
const LeadFinder = lazy(() => import("@/pages/LeadFinder"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const CallQueue = lazy(() => import("@/pages/CallQueue"));
const AISettings = lazy(() => import("@/pages/AISettings"));
const DocumentTemplates = lazy(() => import("@/pages/DocumentTemplates"));
const DocumentTemplateDetail = lazy(() => import("@/pages/DocumentTemplateDetail"));
const RateCardPage = lazy(() => import("@/pages/RateCardPage"));
const BillingOverview = lazy(() => import("@/pages/BillingOverview"));
const InvoicesPage = lazy(() => import("@/pages/InvoicesPage"));
const InvoiceDetail = lazy(() => import("@/pages/InvoiceDetail"));
const PaymentsPage = lazy(() => import("@/pages/PaymentsPage"));
const ProviderBillingPage = lazy(() => import("@/pages/ProviderBillingPage"));
const ProviderInvoiceView = lazy(() => import("@/pages/ProviderInvoiceView"));
const MyDocuments = lazy(() => import("@/pages/MyDocuments"));
const CounterSignPage = lazy(() => import("@/pages/CounterSignPage"));
const DocumentReviewPage = lazy(() => import("@/pages/DocumentReviewPage"));
const SigningFieldsEditor = lazy(() => import("@/pages/SigningFieldsEditor"));
const CalendarPage = lazy(() => import("@/pages/CalendarPage"));
const MyAppointments = lazy(() => import("@/pages/MyAppointments"));
const TrainingVideoManager = lazy(() => import("@/pages/TrainingVideoManager"));
const ProviderTraining = lazy(() => import("@/pages/ProviderTraining"));
const TrainingVideoPlayer = lazy(() => import("@/pages/TrainingVideoPlayer"));
const BookOnboardingCall = lazy(() => import("@/pages/BookOnboardingCall"));
const LawFirms = lazy(() => import("@/pages/LawFirms"));
const LawFirmDetail = lazy(() => import("@/pages/LawFirmDetail"));
const LFDocuments = lazy(() => import("@/pages/law-firm-portal/LFDocuments"));
const LFBilling = lazy(() => import("@/pages/law-firm-portal/LFBilling"));
const LFTraining = lazy(() => import("@/pages/law-firm-portal/LFTraining"));
const LFSupport = lazy(() => import("@/pages/law-firm-portal/LFSupport"));
const LFProfile = lazy(() => import("@/pages/law-firm-portal/LFProfile"));
const LFAppointments = lazy(() => import("@/pages/law-firm-portal/LFAppointments"));
const BatchSendPage = lazy(() => import("@/pages/BatchSendPage"));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));

function PageLoader() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64 mt-4" />
    </div>
  );
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthRoute />} />
      <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
      <Route path="/providers" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><Providers /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/providers/:id" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><ProviderDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/contracts" element={<ProtectedRoute><LazyPage><Contracts /></LazyPage></ProtectedRoute>} />
      <Route path="/contracts/new" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><ContractCreate /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/contracts/:id" element={<ProtectedRoute><LazyPage><ContractDetail /></LazyPage></ProtectedRoute>} />
      <Route path="/contracts/:id/review" element={<ProtectedRoute><LazyPage><ContractReviewPage /></LazyPage></ProtectedRoute>} />
      <Route path="/deal-types" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><DealTypes /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><Pipeline /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/helpdesk" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><HelpDesk /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/helpdesk/:id" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><TicketDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><Analytics /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><MapView /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><ReportsPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><OnboardingQueue /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/onboarding/:id" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><OnboardingDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><UsersPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><SettingsPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/audit-log" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><AuditLogPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/ai-settings" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><AISettings /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/rate-card" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><RateCardPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><BillingOverview /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing/provider" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><ProviderBillingPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing/:id" element={<ProtectedRoute><LazyPage><ProviderInvoiceView /></LazyPage></ProtectedRoute>} />
      <Route path="/billing/invoices" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><InvoicesPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing/invoices/:id" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><InvoiceDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing/payments" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><PaymentsPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/billing/rate-card" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><RateCardPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/document-templates" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><DocumentTemplates /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/document-templates/:id" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><DocumentTemplateDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/document-templates/:id/fields" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><SigningFieldsEditor /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/contracts/:id/fields" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><SigningFieldsEditor /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/signatures" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><SignaturesPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/batch-send" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><BatchSendPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/counter-sign/:requestId" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><CounterSignPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/leads" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><LeadFinder /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/campaigns" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><Campaigns /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/campaigns/:id" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><CampaignDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/campaigns/:id/queue" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><CallQueue /></LazyPage></RoleGuard></ProtectedRoute>} />
      {/* Public signing route — auth via ?token=<signer_token> query param validated inside SigningPage */}
      <Route path="/sign/:requestId" element={<LazyPage><SigningPage /></LazyPage>} />
      <Route path="/my-documents" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><MyDocuments /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/document-review/:docId" element={<ProtectedRoute><LazyPage><DocumentReviewPage /></LazyPage></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><Support /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/support/:id" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><TicketDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><LazyPage><ProfilePage /></LazyPage></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><LazyPage><NotificationsPage /></LazyPage></ProtectedRoute>} />
      <Route path="/calendar" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><CalendarPage /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/my-appointments" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><MyAppointments /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/training-videos" element={<ProtectedRoute><RoleGuard roles={["admin"]}><LazyPage><TrainingVideoManager /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/training" element={<ProtectedRoute><RoleGuard roles={["provider"]}><LazyPage><ProviderTraining /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/training/:videoId" element={<ProtectedRoute><RoleGuard roles={["provider", "law_firm"]}><LazyPage><TrainingVideoPlayer /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/book/onboarding/:workflowId" element={<ProtectedRoute><LazyPage><BookOnboardingCall /></LazyPage></ProtectedRoute>} />
      <Route path="/law-firms" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><LawFirms /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/law-firms/:id" element={<ProtectedRoute><RoleGuard roles={["admin", "sales_rep"]}><LazyPage><LawFirmDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      {/* Law Firm Portal Routes */}
      <Route path="/lf/documents" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFDocuments /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/billing" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFBilling /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/training" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFTraining /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/support" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFSupport /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/support/:id" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><TicketDetail /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/profile" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFProfile /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="/lf/appointments" element={<ProtectedRoute><RoleGuard roles={["law_firm"]}><LazyPage><LFAppointments /></LazyPage></RoleGuard></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
