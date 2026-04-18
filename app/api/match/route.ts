import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await serverApi.getMatch());
}
