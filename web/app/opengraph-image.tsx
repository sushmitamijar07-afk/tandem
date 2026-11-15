import { ImageResponse } from "next/og";

export const alt = "Tandem: swap MUSD and BTC in short rounds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f5f7",
          color: "#14181f",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, background: "#14508a", display: "flex" }} />
          <div style={{ fontSize: 44, fontWeight: 600 }}>Tandem</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, lineHeight: 1.08, maxWidth: 1000 }}>Swap MUSD and BTC in short rounds.</div>
          <div style={{ fontSize: 32, color: "#566070" }}>
            Opposite swaps are matched first. Only the leftover goes to the pool.
          </div>
        </div>
        <div style={{ fontSize: 26, color: "#14508a" }}>Mezo Testnet</div>
      </div>
    ),
    size,
  );
}
