import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

/** Force-start a loaded MatchZy match that is still waiting on ready-ups. */
export const POST = route(async () => {
  await serverApi.forceStartMatch();
  return NextResponse.json({ ok: true });
});
