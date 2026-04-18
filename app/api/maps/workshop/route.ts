import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    workshopId?: string;
    displayName?: string;
  };
  if (!body.workshopId) {
    return NextResponse.json(
      { error: "workshopId required" },
      { status: 400 },
    );
  }
  return NextResponse.json(
    await serverApi.subscribeWorkshop(body.workshopId, body.displayName),
  );
}
