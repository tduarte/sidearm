import { NextResponse } from "next/server";
import { route } from "@/lib/api/route";
import { listDemos } from "@/lib/cs2/demos";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return NextResponse.json(await listDemos());
});
