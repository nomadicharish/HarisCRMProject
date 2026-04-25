import React from "react";

function PageLoader({ label = "Loading..." }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        width: "100%",
        minHeight: "280px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px"
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          padding: "18px 20px",
          borderRadius: "14px",
          background: "#ffffff",
          border: "1px solid rgba(148,163,184,0.35)",
          boxShadow: "0 10px 24px rgba(15,23,42,0.08)"
        }}
      >
        <img src="/loading.gif" alt="Loading" style={{ width: "52px", height: "52px", objectFit: "contain" }} />
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>{label}</div>
      </div>
    </div>
  );
}

export default PageLoader;
