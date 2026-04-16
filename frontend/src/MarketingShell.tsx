import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import { BrandLogo } from "./BrandLogo";

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "0.82rem",
    color: active ? "var(--text)" : "var(--muted)",
    textDecoration: "none",
    padding: "6px 12px",
    fontWeight: active ? 600 : 500,
    transition: "color 150ms ease",
  };
}

function IconArrowRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

export function MarketingNav() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        height: 60,
        display: "flex",
        alignItems: "center",
        transition: "background 200ms ease, border-color 200ms ease",
        background: scrolled ? "rgba(11,21,32,0.92)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <BrandLogo size={30} radius={8} />
          <span style={{ fontWeight: 700, fontSize: "0.95rem", letterSpacing: "-0.01em" }}>
            AlphaGraph
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NavLink to="/" style={({ isActive }) => navLinkStyle(isActive)} end>
            Home
          </NavLink>
          <NavLink to="/docs" style={({ isActive }) => navLinkStyle(isActive)}>
            Docs
          </NavLink>
          <button
            onClick={() => navigate("/app")}
            style={{
              marginLeft: 8,
              padding: "7px 18px",
              background: "var(--accent)",
              color: "#0d1117",
              border: "none",
              borderRadius: 8,
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 6,
              transition: "filter 150ms ease, transform 150ms ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.filter = "brightness(1.1)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "brightness(1)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Try Now <IconArrowRight />
          </button>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer
      style={{
        borderTop: "1px solid var(--border)",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <BrandLogo size={22} radius={6} />
          <span style={{ fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>AlphaGraph</span>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--subtle)", margin: 0 }}>
          Autonomous factor research powered by agentic AI.
        </p>
      </div>
    </footer>
  );
}
