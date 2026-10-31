import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type StorageEntry = { name: string; id?: string | null; metadata?: unknown };

function tokenIssuedRecently(token: string, maxAgeSeconds = 10 * 60) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const issuedAt = Number(payload.iat);
    const now = Math.floor(Date.now() / 1000);
    return Number.isFinite(issuedAt) && issuedAt <= now + 30 && now - issuedAt <= maxAgeSeconds;
  } catch {
    return false;
  }
}

async function listAllFiles(admin: ReturnType<typeof createClient>, bucket: string, userId: string) {
  const files: string[] = [];
  const pending = [userId];
  while (pending.length) {
    const folder = pending.pop()!;
    let offset = 0;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`Could not inspect ${bucket} storage: ${error.message}`);
      const entries = (data || []) as StorageEntry[];
      for (const entry of entries) {
        const path = folder + "/" + entry.name;
        if (!entry.id && !entry.metadata) pending.push(path);
        else files.push(path);
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  return files;
}

async function removeUserFiles(admin: ReturnType<typeof createClient>, bucket: string, userId: string) {
  const paths = await listAllFiles(admin, bucket, userId);
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`Could not remove files from ${bucket}: ${error.message}`);
  }
  return paths.length;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "A signed-in session is required." }, 401);

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) return json({ error: "Account deletion is not configured." }, 503);

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Your session could not be verified." }, 401);
    if (!tokenIssuedRecently(token)) {
      return json({ error: "For security, sign in again immediately before deleting your account." }, 401);
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirmation !== "DELETE MY ACCOUNT") {
      return json({ error: 'Type "DELETE MY ACCOUNT" to confirm permanent deletion.' }, 400);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Household data is shared. Never cascade-delete an owner or silently remove a member.
    const [{ data: ownedHouseholds, error: ownerError }, { data: memberships, error: memberError }] = await Promise.all([
      admin.from("households").select("id,name").eq("owner_id", user.id),
      admin.from("household_members").select("household_id,role").eq("user_id", user.id),
    ]);
    if (ownerError || memberError) {
      console.error("Account deletion household preflight failed", ownerError?.message || memberError?.message);
      return json({ error: "Could not verify household relationships. No account data was deleted." }, 500);
    }
    if (ownedHouseholds?.length) {
      return json({
        error: "Transfer ownership or delete each household before deleting this account.",
        code: "HOUSEHOLD_OWNERSHIP_REQUIRES_ACTION",
        households: ownedHouseholds.map((item) => ({ id: item.id, name: item.name })),
      }, 409);
    }
    if (memberships?.length) {
      return json({
        error: "Leave each household before deleting this account.",
        code: "HOUSEHOLD_MEMBERSHIP_REQUIRES_ACTION",
        householdIds: memberships.map((item) => item.household_id),
      }, 409);
    }

    // Storage is cleaned before auth deletion. A failure stops the workflow and
    // leaves the account intact; retries are safe because removal is idempotent.
    const removed = {
      receipts: await removeUserFiles(admin, "proofpocket-receipts", user.id),
      vault: await removeUserFiles(admin, "proofpocket-vault", user.id),
    };

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error("Auth account deletion failed after storage cleanup", deleteError.message);
      return json({
        error: "Storage cleanup completed, but the sign-in account could not be deleted. Retry the request.",
        code: "AUTH_DELETE_RETRY_REQUIRED",
        removed,
      }, 500);
    }

    return json({ deleted: true, removed });
  } catch (error) {
    console.error("delete-account failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Account deletion stopped before completion. Your sign-in account was not deleted." }, 500);
  }
});
