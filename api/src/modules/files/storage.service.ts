import { Injectable, Logger } from "@nestjs/common";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import type { ReadStream } from "node:fs";

export interface StoredObject {
  /** Opaque storage key, e.g. "staff-documents/ab12….pdf". */
  key: string;
  /** URL the client uses to fetch it back (served by GET /files/:key). */
  url: string;
}

export interface SaveInput {
  category: string;
  filename: string;
  mime: string;
  buffer: Buffer;
}

/**
 * Swappable storage boundary. The default implementation writes to a local
 * directory (STORAGE_DIR, default ./storage) and serves files back through the
 * authenticated GET /files/:key endpoint. To move to S3/GCS/R2, replace the body
 * of save/read/remove with the SDK calls and return the object URL from save() —
 * nothing else in the app changes (mirrors EmailService / PaymentGatewayService).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger("StorageService");
  private readonly root = normalize(process.env.STORAGE_DIR || join(process.cwd(), "storage"));

  async save(input: SaveInput): Promise<StoredObject> {
    const ext = (extname(input.filename) || "").toLowerCase().slice(0, 10);
    // Category is a fixed server-chosen slug; the random id keeps keys unguessable.
    const safeCategory = input.category.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "misc";
    const key = `${safeCategory}/${randomUUID()}${ext}`;
    const dest = this.resolve(key);
    await mkdir(join(this.root, safeCategory), { recursive: true });
    await writeFile(dest, input.buffer);
    this.logger.log(`stored ${key} (${input.buffer.length} bytes, ${input.mime})`);
    return { key, url: `/api/files/${key}` };
  }

  read(key: string): ReadStream | null {
    const path = this.resolve(key);
    if (!path || !existsSync(path)) return null;
    return createReadStream(path);
  }

  async remove(key: string): Promise<void> {
    const path = this.resolve(key);
    if (path && existsSync(path)) await unlink(path).catch(() => undefined);
  }

  /** Resolve a key to an absolute path, rejecting any traversal outside root. */
  private resolve(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root)) return ""; // "../" escape attempt
    return path;
  }
}
