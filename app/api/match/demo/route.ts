import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { action?: unknown };
  if (body.action !== "start" && body.action !== "stop") {
    return NextResponse.json(
      { error: 'action must be "start" or "stop"' },
      { status: 400 },
    );
  }
  return NextResponse.json(await serverApi.setDemo(body.action));
});
