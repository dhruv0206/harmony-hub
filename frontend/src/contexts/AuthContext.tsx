import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  profile: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
  loading: boolean;
  // True once user_roles + profiles have been fetched (or the user is logged out).
  // Distinct from `loading` so route guards can wait for the role before deciding
  // whether to redirect — otherwise a fresh page load briefly sees `role: null`
  // and bounces admin-only routes back to "/".
  userDataLoaded: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  profile: null,
  loading: true,
  userDataLoaded: false,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);
  const [userDataLoaded, setUserDataLoaded] = useState(false);

  // NOTE: Don't await this from inside onAuthStateChange — calling Supabase
  // queries from that callback deadlocks the SDK. Always fire-and-forget via
  // setTimeout(..., 0) and let `userDataLoaded` flip when it finishes.
  const fetchUserData = async (userId: string) => {
    const [roleRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).single(),
      supabase.from("profiles").select("full_name, email, avatar_url").eq("id", userId).single(),
    ]);
    if (roleRes.data) setRole(roleRes.data.role);
    if (profileRes.data) setProfile(profileRes.data);
    setUserDataLoaded(true);
  };

  const loginLogged = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchUserData(session.user.id), 0);
          // Log login audit event (only once per session)
          if (event === "SIGNED_IN" && loginLogged.current !== session.user.id) {
            loginLogged.current = session.user.id;
            (supabase as any).from("audit_log").insert({
              actor_id: session.user.id,
              actor_type: "admin",
              action: "user.login",
              entity_type: "user",
              entity_id: session.user.id,
              details: { email: session.user.email },
            });
          }
        } else {
          setRole(null);
          setProfile(null);
          setUserDataLoaded(true);
          loginLogged.current = null;
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserData(session.user.id);
      } else {
        setUserDataLoaded(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole(null);
    setProfile(null);
    setUserDataLoaded(true);
  };

  return (
    <AuthContext.Provider value={{ session, user, role, profile, loading, userDataLoaded, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
