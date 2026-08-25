import { NextResponse } from "next/server";
import { parseLogBody } from "@/lib/cs2/log-parser";
import { appendConsole, appendChat, ingestEvent } from "@/lib/api/server/real";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const expected = process.env.LOG_INGEST_SECRET ?? "";
  // Constant-time compare; an unset secret must never match.
  if (expected === "" || !safeEqual(secret, expected)) {
    return NextResponse.json({ error: "forbidden" }, { status: 404 });
  }

  const body = await req.text();
  // A log POST is a handful of lines; anything larger is not from CS2.
  if (body.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }
  const { events, consoleEvents, chatMessages } = parseLogBody(body);

  for (const ev of consoleEvents) appendConsole(ev);
  for (const msg of chatMessages) appendChat(msg);
  for (const event of events) ingestEvent(event);

  return NextResponse.json({ ok: true, lines: consoleEvents.length });
}
