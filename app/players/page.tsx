import { redirect } from "next/navigation";

/**
 * The roster lives on Ops now. Kept as a redirect rather than deleted so
 * existing bookmarks and links still land somewhere useful.
 */
export default function PlayersPage() {
  redirect("/dashboard");
}
