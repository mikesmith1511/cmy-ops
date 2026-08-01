// app/api/admin/sweep/route.ts
//
// GET    /api/admin/sweep            -> dry-run preview (never writes)
// POST   /api/admin/sweep            -> execute the sweep
// DELETE /api/admin/sweep?batch=UUID -> undo a sweep batch
//
// Optional query params on GET/POST:
//   asOf=2026-08-01     override cutoff (defaults to today, America/New_York)
//   territories=WW,TV   restrict to specific territories
//   ackCancellations=0  skip clearing the stale cancellation-ack queue
//   normalize=0         skip fixing status=complete / state<>done drift

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  );

// Swap this for the same admin guard your other /api/admin routes use.
// Fallback: shared secret header, set SWEEP_ADMIN_KEY in Vercel.
function assertAdmin(req: Request) {
  const key = process.env.SWEEP_ADMIN_KEY;
  if (!key) return null; // no key configured -> rely on your route middleware
  if (req.headers.get("x-admin-key") !== key) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

function args(req: Request, dryRun: boolean) {
  const q = new URL(req.url).searchParams;
  const terr = q.get("territories");
  return {
    p_as_of: q.get("asOf") || null,
    p_dry_run: dryRun,
    p_ack_cancellations: q.get("ackCancellations") !== "0",
    p_normalize_completed: q.get("normalize") !== "0",
    p_territories: terr ? terr.split(",").map((t) => t.trim().toUpperCase()) : null,
  };
}

export async function GET(req: Request) {
  const denied = assertAdmin(req);
  if (denied) return denied;

  const { data, error } = await admin().rpc("sweep_aged_jobs", args(req, true));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const denied = assertAdmin(req);
  if (denied) return denied;

  const { data, error } = await admin().rpc("sweep_aged_jobs", args(req, false));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: Request) {
  const denied = assertAdmin(req);
  if (denied) return denied;

  const batch = new URL(req.url).searchParams.get("batch");
  if (!batch) {
    return NextResponse.json({ error: "batch required" }, { status: 400 });
  }

  const { data, error } = await admin().rpc("unsweep_jobs", { p_batch_id: batch });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/* ---------------------------------------------------------------------
   Minimal admin button — drop into your admin page:

   "use client";
   import { useState } from "react";

   export function SweepButton() {
     const [preview, setPreview] = useState<any>(null);
     const [result, setResult] = useState<any>(null);
     const [busy, setBusy] = useState(false);

     const run = async (method: "GET" | "POST") => {
       setBusy(true);
       const r = await fetch("/api/admin/sweep", { method });
       const j = await r.json();
       method === "GET" ? setPreview(j) : (setResult(j), setPreview(null));
       setBusy(false);
     };

     return (
       <div className="space-y-3">
         <button
           onClick={() => run("GET")}
           disabled={busy}
           className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50"
         >
           Preview queue cleanup
         </button>

         {preview && (
           <div className="rounded border p-3 text-sm">
             <p>
               Closing {preview.swept_drops} drop legs and {preview.swept_picks} pick
               legs dated before {preview.cutoff}.
             </p>
             <p>
               Acknowledging {preview.acked_cancellations} stale cancellations,
               normalizing {preview.normalized}.
             </p>
             <p className="font-medium">
               Staying live: {preview.kept_open_drops} drops, {preview.kept_open_picks} picks.
             </p>
             <button
               onClick={() => run("POST")}
               disabled={busy}
               className="mt-2 rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
             >
               Confirm cleanup
             </button>
           </div>
         )}

         {result?.batch_id && (
           <p className="text-sm">
             Done. Batch {result.batch_id} —{" "}
             <button
               className="underline"
               onClick={() =>
                 fetch(`/api/admin/sweep?batch=${result.batch_id}`, { method: "DELETE" })
                   .then((r) => r.json())
                   .then(setResult)
               }
             >
               undo
             </button>
           </p>
         )}
       </div>
     );
   }
--------------------------------------------------------------------- */
