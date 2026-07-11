import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import type { Response } from "express";

/**
 * Maps multer upload errors to clean HTTP responses (oversize file → 413, other
 * upload errors → 400) instead of the default unhandled 500.
 */
@Catch()
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const err = exception as { name?: string; code?: string; status?: number; message?: string };

    // Let already-typed HttpExceptions pass through untouched.
    if (typeof err?.status === "number" && err.status >= 400 && err.status < 500 && err.name !== "MulterError") {
      return res.status(err.status).json({ statusCode: err.status, message: err.message });
    }

    if (err?.name === "MulterError") {
      const tooBig = err.code === "LIMIT_FILE_SIZE";
      const status = tooBig ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
      return res.status(status).json({
        statusCode: status,
        error: HttpStatus[status],
        message: tooBig ? "File exceeds the maximum allowed size" : "Invalid upload",
      });
    }

    const status = typeof err?.status === "number" ? err.status : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({ statusCode: status, message: err?.message ?? "Upload failed" });
  }
}
