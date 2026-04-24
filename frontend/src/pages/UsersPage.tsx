import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { TableSkeleton } from "@/components/Skeletons";

export default function UsersPage() {
  const pagination = usePagination(20);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["users", pagination.page],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("profiles")
        .select("*, user_roles(role)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(pagination.from, pagination.to);
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
  });

  const users = usersData?.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Users</h1>
        <p className="text-muted-foreground">Manage platform users</p>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="p-0"><TableSkeleton rows={10} cols={4} /></TableCell></TableRow>
              ) : users && users.length > 0 ? (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {(u.user_roles as any)?.[0]?.role?.replace("_", " ") || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={usersData?.count ?? 0}
            onPrev={pagination.prev}
            onNext={pagination.next}
          />
        </CardContent>
      </Card>
    </div>
  );
}
