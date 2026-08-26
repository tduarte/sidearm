import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/**
 * Restarts the CS2 container, which re-runs `steamcmd app_update 730` on boot.
 * Deliberately unconditional: the operator asked for it, so unlike the
 * automatic path this does not wait for the server to empty.
 */
export const POST = route(async () => {
  await serverApi.applyUpdate();
  return NextResponse.json({ ok: true });
});
