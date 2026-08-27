import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { action?: unknown };
  // Explicit direction, never a toggle: the server has no pause state to read
  // back, so a toggle would guess — and guess wrong after a panel restart.
  if (body.action !== "pause" && body.action !== "unpause") {
    return NextResponse.json(
      { error: 'action must be "pause" or "unpause"' },
      { status: 400 },
    );
  }
  return NextResponse.json(await serverApi.setPause(body.action));
});
