import { ImageResponse } from "next/og";
import { site } from "@/config/site";
import { landing } from "@/content/landing";

// The picture shown when a Polisher link is shared, built at build time from the site's own words,
// colours and spark mark (src/app/icon.svg). Next.js uses it for twitter:image too.
export const alt = landing.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "radial-gradient(circle at 78% 22%, rgba(99,82,245,0.45), #121214 58%)",
          color: "#f4f4f5",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <svg viewBox="0 0 32 32" width="120" height="120">
            <rect width="32" height="32" rx="9" fill="#6352f5" />
            <g transform="translate(6.08 6.08) scale(0.82)" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5c.6 3.9 2.6 5.9 6.5 6.5-3.9.6-5.9 2.6-6.5 6.5-.6-3.9-2.6-5.9-6.5-6.5 3.9-.6 5.9-2.6 6.5-6.5Z" />
              <path d="M19 16.5c.25 1.4.85 2 2.25 2.25-1.4.25-2 .85-2.25 2.25-.25-1.4-.85-2-2.25-2.25 1.4-.25 2-.85 2.25-2.25Z" />
            </g>
          </svg>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>{site.name}</div>
        </div>
        <div style={{ marginTop: 40, fontSize: 56, color: "#b4b4bc", maxWidth: 1008, lineHeight: 1.2 }}>{site.tagline}</div>
      </div>
    ),
    size,
  );
}
