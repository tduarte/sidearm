import { redirect } from "next/navigation";

/**
 * Match folded into the dashboard.
 *
 * The split it encoded — a scoreboard you watch on one page, controls you
 * press on another — is the thing the redesign removed. Setting up a match is
 * editing the match already running, so the teams, the series and the mode are
 * now on the same screen as the score they change.
 *
 * Its live half went the same way: pause, knife, swap, demo and end are the
 * dock; round backups and the phase commands are behind More; the practice
 * cvars appear with the practice mode and leave with it. Demos moved to
 * History, where the matches they record already were.
 *
 * A redirect rather than a delete, so bookmarks and old links still land
 * somewhere useful — the precedent `app/players/page.tsx` set.
 */
export default function MatchPage() {
  redirect("/dashboard");
}
