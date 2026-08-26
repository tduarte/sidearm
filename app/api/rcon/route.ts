import { NextResponse } from "next/server";
import { serverApi } from "@/lib/api/server";
import { route } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const body = (await req.json()) as { command?: string };
  if (typeof body.command !== "string") {
    return NextResponse.json(
      { error: "command (string) required" },
      { status: 400 },
    );
  }
  const output = await serverApi.rcon(body.command);
  return NextResponse.json({ output });
});
