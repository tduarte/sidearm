import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";
import type { MatchDefinition } from "@/lib/cs2/match-config";

export const dynamic = "force-dynamic";

/** Match setups the panel holds. Not the results — those are MatchZy's. */
export const GET = route(async () => {
  return NextResponse.json(await serverApi.getMatchConfigs());
});

export const POST = route(async (req: Request) => {
  const def = (await req.json()) as MatchDefinition;
  return NextResponse.json(await serverApi.saveMatch(def));
});
