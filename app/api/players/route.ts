import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return NextResponse.json(await serverApi.getPlayers());
});
