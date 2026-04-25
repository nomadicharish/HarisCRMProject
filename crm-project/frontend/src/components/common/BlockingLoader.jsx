import React from "react";

function BlockingLoader({ open = false, label = "Please wait..." }) {
  if (!open) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(255,255,255,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 25
      }}
    >
      <div
        style={{
          minWidth: 220,
          border: "1px solid #d7deea",
          background: "#ffffff",
          padding: "18px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          boxShadow: "0 14px 34px rgba(15, 23, 42, 0.18)"
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            border: "3px solid #dbe6fb",
            borderTopColor: "#0052cc",
            borderRadius: "50%",
            animation: "blockingLoaderSpin 0.8s linear infinite"
          }}
        />
        <div style={{ fontSize: 13, color: "#344054", fontWeight: 600 }}>{label}</div>
      </div>
      <style>
        {`@keyframes blockingLoaderSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}
      </style>
    </div>
  );
}

export default BlockingLoader;
