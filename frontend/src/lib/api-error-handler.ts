import { toast } from "sonner";

/**
 * Centralized Supabase error handler with user-friendly messages.
 * Use in every query/mutation onError or catch block.
 */
export function handleSupabaseError(error: any, context: string = "Request") {
  console.error(`[${context}]`, error);

  const code = error?.code;
  const message = error?.message || "";
  const hint = error?.hint || "";

  // Auth / session errors
  if (message.includes("JWT expired") || message.includes("token is expired")) {
    toast.error("Your session has expired. Please log in again.");
    setTimeout(() => { window.location.href = "/auth"; }, 1500);
    return;
  }

  if (code === "PGRST301" || message.includes("permission denied") || message.includes("new row violates row-level security")) {
    toast.error("You do not have permission to perform this action.");
    return;
  }

  if (code === "23505") {
    toast.error("This record already exists (duplicate entry).");
    return;
  }

  if (code === "23503") {
    toast.error("Cannot complete this action — a related record is required or still in use.");
    return;
  }

  if (code === "23502") {
    const col = hint?.match(/column "(\w+)"/)?.[1];
    toast.error(col ? `Required field "${col}" is missing.` : "A required field is missing.");
    return;
  }

  if (code === "42501") {
    toast.error("You do not have permission to access this data.");
    return;
  }

  if (message.includes("Failed to fetch") || message.includes("NetworkError") || message.includes("ERR_INTERNET_DISCONNECTED")) {
    toast.error("Network error. Please check your internet connection and try again.");
    return;
  }

  if (code === "PGRST116") {
    toast.error("The requested record was not found.");
    return;
  }

  if (message.includes("rate limit") || code === "429") {
    toast.error("Too many requests. Please wait a moment and try again.");
    return;
  }

  // Generic fallback
  toast.error(`${context}: ${message || "Something went wrong. Please try again."}`);
}

/**
 * Wraps a Supabase query result and throws if there's an error.
 * Usage: const data = await supabaseQuery("Providers", supabase.from("providers").select("*"));
 */
export async function supabaseQuery<T>(
  context: string,
  promise: PromiseLike<{ data: T; error: any }>
): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    handleSupabaseError(error, context);
    throw error;
  }
  return data;
}
