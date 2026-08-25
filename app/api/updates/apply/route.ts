import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/**
 * Restarts the CS2 container, which re-runs `steamcmd app_update 730` on boot.
 * Deliberately unconditional: the operator asked for it, so unlike the
 * automatic path this does not wait for the server to empty.
 */
export async function POST() {
  await serverApi.applyUpdate();
  return NextResponse.json({ ok: true });
}
