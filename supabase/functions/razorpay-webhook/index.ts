import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacSha256(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (Deno.env.get("RAZORPAY_MODE") !== "test") return json({ error: "Test mode only" }, 503);
    const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
    if (!secret) return json({ error: "Webhook is not configured" }, 503);
    const raw = await req.text();
    const received = req.headers.get("x-razorpay-signature") || "";
    const expected = await hmacSha256(secret, raw);
    if (!safeEqual(received, expected)) return json({ error: "Invalid signature" }, 401);

    const event = JSON.parse(raw);
    const eventId = req.headers.get("x-razorpay-event-id");
    if (!eventId || typeof event.event !== "string") return json({ error: "Missing event identity" }, 400);
    const subscription = event.payload?.subscription?.entity;
    if (!subscription?.id) return json({ received: true, ignored: true });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const createdAt = Number(event.created_at || 0);
    const { error: eventError } = await admin.from("razorpay_webhook_events").insert({
      event_id: eventId, event_type: event.event, created_at: createdAt,
    });
    if (eventError) {
      if (eventError.code === "23505") return json({ received: true, duplicate: true });
      console.error("Webhook event persistence failed", eventError.message);
      return json({ error: "Could not persist event" }, 500);
    }

    const { data: current, error: lookupError } = await admin.from("subscriptions")
      .select("id,last_event_created_at").eq("razorpay_subscription_id", subscription.id).maybeSingle();
    if (lookupError) return json({ error: "Subscription lookup failed" }, 500);
    if (!current) return json({ received: true, ignored: true });
    if (createdAt && createdAt < Number(current.last_event_created_at || 0)) return json({ received: true, stale: true });

    const stateByEvent: Record<string, { status: string; entitled: boolean }> = {
      "subscription.activated": { status: "active", entitled: true },
      "subscription.charged": { status: "active", entitled: true },
      "subscription.pending": { status: "pending", entitled: false },
      "subscription.halted": { status: "halted", entitled: false },
      "subscription.paused": { status: "paused", entitled: false },
      "subscription.cancelled": { status: "cancelled", entitled: false },
      "subscription.completed": { status: "completed", entitled: false },
      "subscription.resumed": { status: "active", entitled: true },
    };
    const mapped = stateByEvent[event.event];
    if (!mapped) return json({ received: true, ignored: true });
    const epoch = (value: unknown) => typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : null;
    const { error: updateError } = await admin.from("subscriptions").update({
      status: mapped.status,
      plus_entitled: mapped.entitled,
      current_start: epoch(subscription.current_start),
      current_end: epoch(subscription.current_end),
      cancel_at_cycle_end: Boolean(subscription.cancel_at_cycle_end),
      last_event_created_at: Math.max(createdAt, Number(current.last_event_created_at || 0)),
      updated_at: new Date().toISOString(),
    }).eq("id", current.id);
    if (updateError) {
      console.error("Subscription update failed", updateError.message);
      return json({ error: "Could not update subscription" }, 500);
    }
    return json({ received: true });
  } catch (error) {
    console.error("razorpay-webhook error", error instanceof Error ? error.message : "unknown");
    return json({ error: "Webhook processing failed" }, 500);
  }
});
