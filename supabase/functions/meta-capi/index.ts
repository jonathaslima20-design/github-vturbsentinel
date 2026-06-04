import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const META_CAPI_URL = "https://graph.facebook.com/v18.0";

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load tracking config
    const { data: config, error: configError } = await supabase
      .from("landing_tracking_config")
      .select("meta_pixel_id, meta_capi_token, meta_capi_enabled, meta_test_event_code")
      .maybeSingle();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ ok: false, message: "Config not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.meta_capi_enabled || !config.meta_pixel_id || !config.meta_capi_token) {
      return new Response(
        JSON.stringify({ ok: false, message: "CAPI not configured or disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { eventName, eventId, eventData = {}, userData = {}, sourceUrl, fbp, fbc } = body;

    if (!eventName) {
      return new Response(
        JSON.stringify({ ok: false, message: "eventName is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const eventTime = Math.floor(Date.now() / 1000);
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const clientUserAgent = req.headers.get("user-agent") || "";

    const userDataPayload: Record<string, string> = {};
    if (userData.email) {
      userDataPayload.em = await sha256(userData.email);
    }
    if (userData.phone) {
      userDataPayload.ph = await sha256(userData.phone);
    }
    if (clientIp) {
      userDataPayload.client_ip_address = clientIp;
    }
    if (clientUserAgent) {
      userDataPayload.client_user_agent = clientUserAgent;
    }
    if (fbp) {
      userDataPayload.fbp = fbp;
    }
    if (fbc) {
      userDataPayload.fbc = fbc;
    }

    const eventPayload: Record<string, any> = {
      event_name: eventName,
      event_time: eventTime,
      action_source: "website",
      user_data: userDataPayload,
      custom_data: eventData,
    };

    if (eventId) {
      eventPayload.event_id = eventId;
    }
    if (sourceUrl) {
      eventPayload.event_source_url = sourceUrl;
    }

    const payload: Record<string, any> = {
      data: [eventPayload],
    };

    if (config.meta_test_event_code) {
      payload.test_event_code = config.meta_test_event_code;
    }

    const response = await fetch(
      `${META_CAPI_URL}/${config.meta_pixel_id}/events?access_token=${config.meta_capi_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    return new Response(
      JSON.stringify({ ok: true, result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Meta CAPI error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
