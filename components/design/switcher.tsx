"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DIRECTIONS } from "@/lib/design/mock";

/**
 * The strip that lets you flip between the five explorations.
 *
 * Deliberately plain and deliberately ugly-adjacent: it is scaffolding, not
 * one of the directions, and anything with a point of view here would bleed
 * into the judgement of the thing underneath it. Fixed, 32px, one grey.
 */
export function DesignSwitcher() {
  const pathname = usePathname();
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: "2px",
        height: "32px",
        padding: "0 8px",
        background: "#17171a",
        borderBottom: "1px solid #2a2a30",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: "11px",
        color: "#8a8a95",
        overflowX: "auto",
      }}
    >
      <Link href="/design" style={{ padding: "0 8px", color: "#8a8a95" }}>
        explorations
      </Link>
      <span style={{ color: "#3a3a42" }}>/</span>
      {DIRECTIONS.map((d) => {
        const active = pathname === `/design/${d.slug}`;
        return (
          <Link
            key={d.slug}
            href={`/design/${d.slug}`}
            style={{
              padding: "0 8px",
              lineHeight: "32px",
              color: active ? "#fff" : "#8a8a95",
              background: active ? "#2a2a30" : "transparent",
              whiteSpace: "nowrap",
            }}
          >
            {d.name.toLowerCase()}
          </Link>
        );
      })}
      <span style={{ marginLeft: "auto", paddingRight: "4px", color: "#5a5a64" }}>
        mock data
      </span>
    </div>
  );
}
