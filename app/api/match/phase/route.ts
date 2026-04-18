import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import type { MatchState } from "@/lib/api/types";

export const dynamic = "force-dynamic";

const PHASES: MatchState["phase"][] = [
  "idle",
  "warmup",
  "knife",
  "live",
  "halftime",
  "ended",
];

export async function POST(req: Request) {
  const body = (await req.json()) as { phase?: MatchState["phase"] };
  if (!body.phase || !PHASES.includes(body.phase)) {
    return NextResponse.json({ error: "invalid phase" }, { status: 400 });
  }
  return NextResponse.json(await serverApi.setMatchPhase(body.phase));
}
