import AuditLogTable from "@/components/audit/AuditLogTable";

export default function AuditLogPage() {
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground">Complete audit trail of all platform actions for compliance reporting</p>
      </div>
      <AuditLogTable />
    </div>
  );
}
