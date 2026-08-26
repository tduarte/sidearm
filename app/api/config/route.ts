import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";
import type { ServerConfig } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  return NextResponse.json(await serverApi.getConfig());
});

export const PUT = route(async (req: Request) => {
  const cfg = (await req.json()) as ServerConfig;
  return NextResponse.json(await serverApi.putConfig(cfg));
});
