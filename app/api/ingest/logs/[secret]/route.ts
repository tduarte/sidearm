import { NextResponse } from "next/server";
import { parseLogBody } from "@/lib/cs2/log-parser";
import { appendConsole, appendChat, updatePlayerKill } from "@/lib/api/server/real";
import { bus } from "@/lib/ws/bus";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  if (secret !== process.env.LOG_INGEST_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 404 });
  }

  const body = await req.text();
  const { events, consoleEvents, chatMessages } = parseLogBody(body);

  for (const ev of consoleEvents) appendConsole(ev);
  for (const msg of chatMessages) appendChat(msg);
  for (const event of events) {
    if (event.type === "player.kill") {
      updatePlayerKill(event.attackerSteamId, event.victimSteamId);
    } else {
      bus.emit(event);
    }
  }

  return NextResponse.json({ ok: true, lines: consoleEvents.length });
}
