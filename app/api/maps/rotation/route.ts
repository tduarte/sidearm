import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return NextResponse.json(await serverApi.getRotation());
});

export const PUT = route(async (req: Request) => {
  const body = (await req.json()) as { enabled?: unknown; maps?: unknown };
  const next: { enabled?: boolean; maps?: string[] } = {};
  if (typeof body.enabled === "boolean") next.enabled = body.enabled;
  if (Array.isArray(body.maps)) next.maps = body.maps.map(String);
  if (next.enabled === undefined && next.maps === undefined) {
    return NextResponse.json(
      { error: "enabled (boolean) or maps (string[]) required" },
      { status: 400 },
    );
  }
  // The adapter sanitises: duplicates removed, blanks dropped, capped.
  return NextResponse.json(await serverApi.putRotation(next));
});
