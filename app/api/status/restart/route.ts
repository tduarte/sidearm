import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function POST() {
  await serverApi.restart();
  return NextResponse.json({ ok: true });
}
