import { getDb } from "./index";
import type { ChatMessage, Team } from "@/lib/api/types";

export function insertChatMessage(msg: ChatMessage): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO chat_messages (id, ts, steam_id, name, team, message)
    VALUES (@id, @ts, @steamId, @name, @team, @message)
  `).run(msg);
}

export function getChatMessages(limit = 1000): ChatMessage[] {
  const rows = getDb().prepare(`
    SELECT id, ts, steam_id, name, team, message
    FROM chat_messages
    ORDER BY ts DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string; ts: string; steam_id: string; name: string; team: string; message: string;
  }>;
  return rows.reverse().map((r) => ({
    id: r.id,
    ts: r.ts,
    steamId: r.steam_id,
    name: r.name,
    team: r.team as Team,
    message: r.message,
  }));
}
