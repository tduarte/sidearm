<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Learned User Preferences

- Prefer `npm` and `npx` over `pnpm` for scripts and CLI tooling in this workspace.
- TanStack Query v5: prefer `isPending` over `isLoading` when gating UI on having no cached data yet (e.g. skeletons).

## Learned Workspace Facts

- shadcn theme tokens in `app/globals.css` are full colors (often `oklch(...)`), not HSL triples; SVG/CSS should use `var(--primary)` (and similar) directly—wrapping in `hsl(var(--primary))` can render incorrectly.
- This repo is a Next.js app: an admin-style UI for a Counter-Strike 2 dedicated server (project name: sidearm).
- For design tasks, **check the [shadcn registry](https://ui.shadcn.com/) and docs first** (blocks, charts, component pages). Prefer installing or adapting what exists—most pieces are solid as-is or need only light tweaks—before hand-rolling comparable UI.
- Dashboard memory (`MemoryStatCard` in `components/memory-stat-card.tsx`) follows the shadcn **Pie Chart - Donut** pattern: rows include `fill: "var(--color-…)"`, `chartConfig` maps `used` / `free` to `var(--chart-1)` / `var(--chart-4)`, `Pie` with `dataKey="mb"` / `nameKey="segment"` and `innerRadius={60}` (no `Cell`). Center KPI is HTML overlay text.
- Live `status.update` WebSocket handling is centralized in `components/status-live-sync.tsx` (mounted from `components/providers.tsx`); `useServerStatus` is query-only—avoid attaching per-component `status.update` listeners.
- Official map tile art is under `public/maps/official/<map>.png`; `getOfficialMapArtPath` in `lib/maps/official-art.ts` maps internal map names to those paths.
