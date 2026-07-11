import { useEffect, useState } from "react";
import { apiFileObjectUrl } from "@/lib/api/client";

type AuthedImageProps = {
  /** Stored file path/url (e.g. "/api/files/avatars/…"), or null. */
  src?: string | null;
  alt?: string;
  className?: string;
  /** Rendered when there is no src or it fails to load. */
  fallback?: React.ReactNode;
};

/**
 * Displays an image served by the authed GET /files endpoint. A plain <img src>
 * can't send the bearer token, so we fetch the file as a blob and show that.
 * Revokes the object URL on change/unmount.
 */
export function AuthedImage({ src, alt = "", className, fallback = null }: AuthedImageProps) {
  const [objUrl, setObjUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let current: string | null = null;
    setObjUrl(null);
    if (src) {
      apiFileObjectUrl(src).then((u) => {
        if (revoked) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        current = u;
        setObjUrl(u);
      });
    }
    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
    };
  }, [src]);

  if (!src || !objUrl) return <>{fallback}</>;
  return <img src={objUrl} alt={alt} className={className} />;
}
