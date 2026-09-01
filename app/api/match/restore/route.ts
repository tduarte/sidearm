import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const { round } = (await req.json()) as { round: number };
  await serverApi.restoreRound(round);
  return NextResponse.json({ ok: true });
});
