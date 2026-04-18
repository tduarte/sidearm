import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { next?: "running" | "stopped" };
  if (body.next !== "running" && body.next !== "stopped") {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }
  return NextResponse.json(await serverApi.setServerState(body.next));
}
