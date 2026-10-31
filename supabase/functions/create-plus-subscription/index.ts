import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const allowedOrigins = new Set(
  (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .flatMap((value) => {
      try { return [new URL(value).origin]; } catch { return []; }
    }),
);

const corsHeaders = (origin: string | null): HeadersInit => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

const json = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  // CORS is a browser boundary, not authentication. Requests without Origin
  // may be server-to-server and still require a valid Supabase user JWT below.
  if (origin && !allowedOrigins.has(origin)) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: { "Vary": "Origin" },
    });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  try {
    if (Deno.env.get("RAZORPAY_MODE") !== "test") return json({ error: "Billing is locked to Razorpay Test Mode." }, 503, origin);
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ error: "Sign in is required." }, 401, origin);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Your session could not be verified." }, 401, origin);

    const body = await req.json().catch(() => ({}));
    const interval = body?.interval;
    if (interval !== "monthly" && interval !== "yearly") return json({ error: "Choose a valid billing interval." }, 400, origin);
    const planId = Deno.env.get(interval === "monthly" ? "RAZORPAY_PLAN_MONTHLY" : "RAZORPAY_PLAN_YEARLY");
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!planId || !keyId || !keySecret) return json({ error: "Test billing is not configured yet. Ask the project operator to finish setup." }, 503, origin);

    const basic = btoa(`${keyId}:${keySecret}`);
    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Authorization": `Basic ${basic}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: planId,
        total_count: interval === "monthly" ? 120 : 10,
        quantity: 1,
        customer_notify: 1,
        notes: { user_id: user.id, product: "ProofPocket Plus", interval },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.id) {
      console.error("Razorpay subscription create failed", response.status, result?.error?.code || "unknown");
      return json({ error: "Razorpay could not create the test subscription. Please try again later." }, 502, origin);
    }

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error: saveError } = await admin.from("subscriptions").insert({
      user_id: user.id,
      razorpay_subscription_id: result.id,
      razorpay_plan_id: planId,
      plan_interval: interval,
      status: result.status || "created",
      plus_entitled: false,
    });
    if (saveError) {
      console.error("Could not persist subscription mapping", saveError.message);
      return json({ error: "The test subscription could not be safely linked to your account." }, 500, origin);
    }
    return json({ keyId, subscriptionId: result.id, status: result.status || "created" }, 200, origin);
  } catch (error) {
    console.error("create-plus-subscription error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Unable to start the test subscription." }, 500, origin);
  }
});
