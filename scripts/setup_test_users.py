"""Create test users for each role + link them to data rows.

Run once to bootstrap role-based testing:
  sales_rep@test.phh / TestPass123!
  provider@test.phh / TestPass123!
  lawfirm@test.phh  / TestPass123!

What it does:
1. Creates the 3 auth users via Supabase admin API (service-role) with email_confirm=True
   so they can sign in immediately.
2. Sets `user_metadata.role` on each user — our FastAPI auth middleware reads this to
   enforce role gates. Also inserts into public.user_roles (used by RLS helpers).
3. Assigns the sales_rep as the owner of any un-assigned providers (so log-in-as-rep
   shows data).
4. Updates one existing provider's contact_email to provider@test.phh so that user
   sees it in their /my-documents / /support views (RLS matches on contact_email).
5. Updates one existing law_firm's contact_email to lawfirm@test.phh so the
   law_firm portal (/lf/*) shows data.

Usage:
    cd backend
    .venv/Scripts/python.exe ../scripts/setup_test_users.py

Re-runnable: if a user already exists, it will be skipped and role links updated.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Make `app.config` importable from the backend/ working directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import httpx
from supabase import Client, create_client

from app.config import settings  # noqa: E402

PASSWORD = "TestPass123!"

TEST_USERS = [
    {"email": "sales_rep@test.phh", "role": "sales_rep", "full_name": "Sally Sales"},
    {"email": "provider@test.phh",  "role": "provider",  "full_name": "Phil Provider"},
    {"email": "lawfirm@test.phh",   "role": "law_firm",  "full_name": "Larry LawFirm"},
]


def get_client() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env"
        )
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def list_users_via_rest(base_url: str, service_role: str) -> dict[str, dict]:
    """Return a dict of {email: user_dict} for users already in the project."""
    r = httpx.get(
        f"{base_url.rstrip('/')}/auth/v1/admin/users?per_page=1000",
        headers={
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
        },
        timeout=15,
    )
    r.raise_for_status()
    users = r.json().get("users", [])
    return {u["email"]: u for u in users if u.get("email")}


def ensure_user(client: Client, email: str, role: str, full_name: str, existing: dict) -> str:
    """Return the user UUID for `email`, creating if needed. Updates role metadata."""
    if email in existing:
        user_id = existing[email]["id"]
        # Update metadata to make sure role is set correctly.
        client.auth.admin.update_user_by_id(
            user_id,
            {
                "user_metadata": {"role": role, "full_name": full_name},
                "email_confirm": True,
            },
        )
        print(f"  [exists] {email}  (id={user_id[:8]}...)")
        return user_id

    created = client.auth.admin.create_user(
        {
            "email": email,
            "password": PASSWORD,
            "email_confirm": True,
            "user_metadata": {"role": role, "full_name": full_name},
        }
    )
    user_id = created.user.id
    print(f"  [created] {email}  (id={user_id[:8]}...)")
    return user_id


def ensure_user_role(client: Client, user_id: str, role: str) -> None:
    """Upsert into public.user_roles. Idempotent."""
    # Check if row already exists for this (user, role)
    existing = (
        client.table("user_roles")
        .select("id")
        .eq("user_id", user_id)
        .eq("role", role)
        .execute()
    )
    if not existing.data:
        client.table("user_roles").insert(
            {"user_id": user_id, "role": role}
        ).execute()


def ensure_profile(client: Client, user_id: str, email: str, full_name: str) -> None:
    """Profile row is auto-created by the on_auth_user_created trigger, but make
    sure the full_name is set for display."""
    existing = (
        client.table("profiles").select("id").eq("id", user_id).execute()
    )
    if existing.data:
        client.table("profiles").update(
            {"full_name": full_name, "email": email}
        ).eq("id", user_id).execute()


def assign_unassigned_providers_to_rep(client: Client, rep_id: str) -> int:
    """Give the sales_rep some providers to manage."""
    # Grab up to 5 providers with no assigned_sales_rep OR any provider (for simplicity).
    providers = (
        client.table("providers")
        .select("id, business_name, assigned_sales_rep")
        .limit(5)
        .execute()
    )
    updated = 0
    for p in providers.data or []:
        client.table("providers").update({"assigned_sales_rep": rep_id}).eq(
            "id", p["id"]
        ).execute()
        updated += 1
    return updated


def link_provider_to_user(client: Client, provider_email: str) -> str | None:
    """Update the first existing provider to use provider_email as contact_email."""
    providers = client.table("providers").select("id, business_name").limit(1).execute()
    if not providers.data:
        return None
    p = providers.data[0]
    client.table("providers").update({"contact_email": provider_email}).eq(
        "id", p["id"]
    ).execute()
    return p["business_name"]


def link_lawfirm_to_user(client: Client, lawfirm_email: str) -> str | None:
    firms = client.table("law_firms").select("id, firm_name").limit(1).execute()
    if not firms.data:
        return None
    f = firms.data[0]
    client.table("law_firms").update({"contact_email": lawfirm_email}).eq(
        "id", f["id"]
    ).execute()
    return f["firm_name"]


def main() -> None:
    client = get_client()
    existing = list_users_via_rest(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

    print("=" * 60)
    print("Ensuring test users + roles")
    print("=" * 60)
    ids: dict[str, str] = {}
    for u in TEST_USERS:
        uid = ensure_user(client, u["email"], u["role"], u["full_name"], existing)
        ensure_user_role(client, uid, u["role"])
        ensure_profile(client, uid, u["email"], u["full_name"])
        ids[u["role"]] = uid

    print()
    print("=" * 60)
    print("Linking data rows to test users")
    print("=" * 60)
    rep_id = ids["sales_rep"]
    n_assigned = assign_unassigned_providers_to_rep(client, rep_id)
    print(f"  Assigned {n_assigned} providers to sales_rep@test.phh")

    prov_biz = link_provider_to_user(client, "provider@test.phh")
    if prov_biz:
        print(f"  Linked 1 provider to provider@test.phh ('{prov_biz}')")

    lf_name = link_lawfirm_to_user(client, "lawfirm@test.phh")
    if lf_name:
        print(f"  Linked 1 law firm to lawfirm@test.phh ('{lf_name}')")

    print()
    print("=" * 60)
    print("DONE — sign in with any of these:")
    print("=" * 60)
    for u in TEST_USERS:
        print(f"  {u['email']}  /  {PASSWORD}   (role: {u['role']})")
    print()


if __name__ == "__main__":
    main()
