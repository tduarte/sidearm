import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const body = (await req.json()) as { rotation?: string[] };
  if (!Array.isArray(body.rotation)) {
    return NextResponse.json(
      { error: "rotation (string[]) required" },
      { status: 400 },
    );
  }
  await serverApi.setRotation(body.rotation);
  return NextResponse.json({ ok: true });
}
