import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { next?: "running" | "stopped" };
  if (body.next !== "running" && body.next !== "stopped") {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  return NextResponse.json(await serverApi.setServerState(body.next));
});
