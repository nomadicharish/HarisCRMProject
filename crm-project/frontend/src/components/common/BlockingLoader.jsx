import React from "react";

function BlockingLoader({ open = false, label = "Please wait..." }) {
  if (!open) return null;

  return (
    <div className="blockingLoaderOverlay" role="status" aria-live="polite" aria-busy="true">
      <div className="blockingLoaderCard">
        <img src="/loading.gif" alt="Loading" className="blockingLoaderGif" />
        <div className="blockingLoaderSpinner" aria-hidden="true" />
        <div className="blockingLoaderText">{label}</div>
      </div>
    </div>
  );
}

export default BlockingLoader;
