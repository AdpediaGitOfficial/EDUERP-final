import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { apiUpload, type UploadedFileMeta } from "@/lib/api/client";

type FileUploadProps = {
  /** Server-side storage category (must be in the API allowlist). */
  category: string;
  /** Called with the stored file's metadata after a successful upload. */
  onUploaded: (file: UploadedFileMeta) => void | Promise<void>;
  /** `accept` attribute, e.g. "image/*" or ".pdf,.png,.jpg". */
  accept?: string;
  label?: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
};

const MAX_MB = 10;

/**
 * Reusable upload button: pick a file → POST /files → hand the stored metadata
 * to `onUploaded` (the caller persists `meta.url` on its record). Client-side
 * size guard mirrors the API's MAX_UPLOAD_MB so oversize files fail fast.
 */
export function FileUpload({
  category,
  onUploaded,
  accept,
  label = "Upload file",
  disabled,
  variant = "outline",
  size = "sm",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`File is too large (max ${MAX_MB} MB)`);
      return;
    }
    setBusy(true);
    try {
      const meta = await apiUpload(file, category);
      await onUploaded(meta);
      toast.success(`Uploaded ${meta.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handle}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={pick}
        disabled={disabled || busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {label}
      </Button>
    </>
  );
}
