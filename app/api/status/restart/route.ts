import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async () => {
  await serverApi.restart();
  return NextResponse.json({ ok: true });
});
