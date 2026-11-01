import { useEffect, useState } from "react";
import { getSecureFileBlob, getStoragePath } from "../../utils/secureFiles";

function SecureImage({ src, fallback = null, onError, ...imageProps }) {
  const [resolvedSrc, setResolvedSrc] = useState(() => (getStoragePath(src) ? "" : src || ""));

  useEffect(() => {
    const storagePath = getStoragePath(src);
    if (!storagePath) {
      setResolvedSrc(src || "");
      return undefined;
    }

    let active = true;
    let objectUrl = "";
    setResolvedSrc("");
    getSecureFileBlob(storagePath)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setResolvedSrc(objectUrl);
      })
      .catch((error) => console.error("Unable to load secure image", error));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return resolvedSrc ? (
    <img
      src={resolvedSrc}
      {...imageProps}
      onError={(event) => {
        onError?.(event);
        // A successful secure-file request can still contain an unreadable image.
        // Clear it so callers consistently receive their visible fallback.
        setResolvedSrc("");
      }}
    />
  ) : fallback;
}

export default SecureImage;
