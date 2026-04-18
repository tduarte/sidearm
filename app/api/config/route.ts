import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import type { ServerConfig } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await serverApi.getConfig());
}

export async function PUT(req: Request) {
  const cfg = (await req.json()) as ServerConfig;
  return NextResponse.json(await serverApi.putConfig(cfg));
}
