/**
 * Thin client for the FastAPI backend.
 *
 * FastAPI is used only for the narrow set of operations that can't/shouldn't
 * live in Supabase:
 *   - Google Places proxy (geocode, autocomplete) — server-side API key
 *   - CSV bulk imports with background jobs
 *   - On-demand Edge Function triggers (health-score refresh)
 *   - Webhook receivers (stripe, docusign, twilio — future)
 *
 * Everything else continues to hit Supabase directly via @supabase/supabase-js.
 * See docs/superpowers/specs/2026-04-24-providers-slice-design.md.
 */

import { supabase } from "@/integrations/supabase/client";

export const BACKEND_URL = (() => {
  const configured = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.replace(/\/+$/, "");
  if (configured) return configured;
  if (import.meta.env.DEV) return "http://localhost:8000";
  throw new Error(
    "VITE_BACKEND_URL is not set. Configure it in your Vercel project's Environment Variables.",
  );
})();

/** Thrown for any non-2xx response from the backend. Carries the error envelope. */
export class BackendError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;
  requestId?: string;

  constructor(
    message: string,
    opts: {
      code: string;
      status: number;
      details?: Record<string, unknown>;
      requestId?: string;
    },
  ) {
    super(message);
    this.name = "BackendError";
    this.code = opts.code;
    this.status = opts.status;
    this.details = opts.details;
    this.requestId = opts.requestId;
  }
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new BackendError("Not authenticated", {
      code: "UNAUTHORIZED",
      status: 401,
    });
  }
  return { Authorization: `Bearer ${token}` };
}

async function parseError(res: Response): Promise<BackendError> {
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = { error: { code: "HTTP_ERROR", message: res.statusText } };
  }
  const err = body?.error ?? body ?? {};
  return new BackendError(err.message ?? res.statusText, {
    code: err.code ?? `HTTP_${res.status}`,
    status: res.status,
    details: err.details,
    requestId: err.request_id,
  });
}

/** GET JSON from the backend with auth. */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const auth = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "GET",
    headers: { ...auth, Accept: "application/json" },
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** POST JSON to the backend with auth. */
export async function apiPost<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const auth = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: {
      ...auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

/** POST multipart (file upload) to the backend with auth. */
export async function apiPostMultipart<T = unknown>(
  path: string,
  formData: FormData,
): Promise<T> {
  const auth = await getAuthHeader();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { ...auth, Accept: "application/json" },
    body: formData,
  });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

// ---------------------------------------------------------------------------
// Typed wrappers for known endpoints
// ---------------------------------------------------------------------------

export interface GeocodeResponse {
  lat: number;
  lng: number;
  formatted_address: string;
  place_id?: string | null;
}

/** POST /api/v1/geocode — address -> {lat, lng, formatted_address}. */
export async function geocodeAddress(address: string): Promise<GeocodeResponse> {
  return apiPost<GeocodeResponse>("/api/v1/geocode", { address });
}

export interface AutocompleteSuggestion {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text?: string | null;
}

export interface AutocompleteResponse {
  suggestions: AutocompleteSuggestion[];
  session_token: string;
}

/** GET /api/v1/places/autocomplete?query=...&session_token=... */
export async function autocompleteAddress(
  query: string,
  sessionToken?: string,
  country = "us",
): Promise<AutocompleteResponse> {
  const params = new URLSearchParams({ query, country });
  if (sessionToken) params.set("session_token", sessionToken);
  return apiGet<AutocompleteResponse>(
    `/api/v1/places/autocomplete?${params.toString()}`,
  );
}

export interface ImportJobResponse {
  job_id: string;
  status: string;
  total_items: number;
}

/** POST /api/v1/providers/import — multipart CSV upload. Returns job_id. */
export async function importProvidersCsv(file: File): Promise<ImportJobResponse> {
  const fd = new FormData();
  fd.append("file", file);
  return apiPostMultipart<ImportJobResponse>("/api/v1/providers/import", fd);
}

/** POST /api/v1/law-firms/import — multipart CSV upload. Returns job_id. */
export async function importLawFirmsCsv(file: File): Promise<ImportJobResponse> {
  const fd = new FormData();
  fd.append("file", file);
  return apiPostMultipart<ImportJobResponse>("/api/v1/law-firms/import", fd);
}

export interface JobStatusResponse {
  id: string;
  job_type: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  total_items?: number | null;
  processed_items: number;
  result?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  errors?: Array<{ row_index?: number; reason: string }>;
}

/** GET /api/v1/jobs/{id} — poll background job status. */
export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return apiGet<JobStatusResponse>(`/api/v1/jobs/${jobId}`);
}

export interface HealthScoreRefreshResponse {
  provider_id: string;
  new_score: number | null;
  refreshed_at: string;
}

/** POST /api/v1/providers/{id}/health-score/refresh — trigger Edge Function. */
export async function refreshProviderHealthScore(
  providerId: string,
): Promise<HealthScoreRefreshResponse> {
  return apiPost<HealthScoreRefreshResponse>(
    `/api/v1/providers/${providerId}/health-score/refresh`,
  );
}

export interface LeadResult {
  place_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  website: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  user_ratings_total: number | null;
  business_types: string[];
  is_likely_chain: boolean;
}

export interface LeadFinderResponse {
  leads: LeadResult[];
  total_returned: number;
  query: string;
  excluded_chains: number;
}

/** POST /api/v1/lead-finder/search — Google Places-backed lead search. */
export async function searchLeads(body: {
  category: string;
  city?: string;
  state?: string;
  zip?: string;
  result_count: number;
  exclude_chains: boolean;
  enrich: boolean;
}): Promise<LeadFinderResponse> {
  return apiPost<LeadFinderResponse>("/api/v1/lead-finder/search", body);
}
