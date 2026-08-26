import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { action?: unknown };
  if (body.action !== "setup" && body.action !== "restore") {
    return NextResponse.json(
      { error: 'action must be "setup" or "restore"' },
      { status: 400 },
    );
  }
  return NextResponse.json(await serverApi.knife(body.action));
});
