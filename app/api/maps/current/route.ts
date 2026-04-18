import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  await serverApi.changeMap(body.name);
  return NextResponse.json({ ok: true });
}
