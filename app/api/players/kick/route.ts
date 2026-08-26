import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { steamId?: string; reason?: string };
  if (!body.steamId) {
    return NextResponse.json({ error: "steamId required" }, { status: 400 });
  }
  await serverApi.kick(body.steamId, body.reason);
  return NextResponse.json({ ok: true });
});
