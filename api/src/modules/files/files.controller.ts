import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { StorageService } from "./storage.service";
import { MulterExceptionFilter } from "./multer-exception.filter";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

/** Minimal shape of a multer-parsed upload (avoids a hard @types/multer dep). */
interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 10) * 1024 * 1024;

// Server-controlled category allowlist — keeps storage tidy and prevents junk.
const CATEGORIES = new Set([
  "staff-documents",
  "payment-proofs",
  "avatars",
  "asset-documents",
  "vehicle-documents",
  "misc",
]);

// Allowed content types (documents + images).
const MIME_ALLOW = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".txt": "text/plain",
};

@UseGuards(JwtAuthGuard)
@Controller("files")
export class FilesController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Post()
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
    // FileInterceptor exposes the rest of the multipart form on req.body.
    @Res({ passthrough: true }) _res: Response,
  ) {
    if (!file) throw new BadRequestException("No file provided (multipart field 'file')");
    if (!MIME_ALLOW.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException("File exceeds the maximum allowed size");
    }
    // category arrives as a multipart field; validated against the allowlist.
    const category = ((_res.req.body?.category as string) || "misc").trim();
    if (!CATEGORIES.has(category)) throw new BadRequestException("Invalid upload category");

    const stored = await this.storage.save({
      category,
      filename: file.originalname,
      mime: file.mimetype,
      buffer: file.buffer,
    });
    return { ...stored, name: file.originalname, size: file.size, mime: file.mimetype };
  }

  @Get(":category/:name")
  download(
    @Param("category") category: string,
    @Param("name") name: string,
    @Res({ passthrough: true }) res: Response,
  ): StreamableFile {
    const key = `${category}/${name}`;
    const stream = this.storage.read(key);
    if (!stream) throw new NotFoundException("File not found");
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    res.set({
      "Content-Type": EXT_MIME[ext] ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${name}"`,
    });
    return new StreamableFile(stream);
  }
}
