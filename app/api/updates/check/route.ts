import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

/** Forces a check now rather than waiting for the periodic one. */
export async function POST() {
  return NextResponse.json(await serverApi.checkForUpdate());
}
