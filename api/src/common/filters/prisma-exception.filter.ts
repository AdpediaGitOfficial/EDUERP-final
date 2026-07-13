import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/**
 * Translates Prisma errors into proper HTTP responses so malformed input never
 * surfaces as a raw 500. Without this, an invalid UUID path param (P2023) or a
 * DB CHECK-constraint violation (raw query error) bubbles up as an unhandled
 * 500; the frontend never sends such input, but a hardened API should answer
 * 400/404/409, not crash.
 */
@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientValidationError,
  Prisma.PrismaClientUnknownRequestError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("PrismaExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = "Database error";

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case "P2025": // record not found for update/delete
          status = HttpStatus.NOT_FOUND;
          message = "Resource not found";
          break;
        case "P2002": // unique constraint
          status = HttpStatus.CONFLICT;
          message = "A record with these details already exists";
          break;
        case "P2003": // foreign-key constraint
          status = HttpStatus.CONFLICT;
          message = "Operation violates a related-record constraint";
          break;
        case "P2000": // value too long
        case "P2011": // null constraint violation
        case "P2012": // missing required value
        case "P2019": // input error
        case "P2023": // malformed UUID / inconsistent column data
          status = HttpStatus.BAD_REQUEST;
          message = "Invalid input";
          break;
        case "P2021": // table does not exist in the current database
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message =
            "Database schema out of date: a required table is missing. Run the migrations on this environment.";
          break;
        case "P2022": // column does not exist in the current database
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message =
            "Database schema out of date: a required column is missing. Apply the latest migrations, then run `prisma generate`.";
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = `Database error (${exception.code})`;
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = "Invalid input";
    } else if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      // Raw query errors (e.g. a CHECK constraint like assets_status_check, or a
      // 22P02 invalid-text-representation) mean the client sent a bad value.
      const m = exception.message ?? "";
      if (/check constraint|23514|22P02|invalid input|invalid_text/i.test(m)) {
        status = HttpStatus.BAD_REQUEST;
        message = "Invalid input";
      }
    }

    if (status >= 500) {
      // Surface the Prisma code + meta (e.g. which table/column) so schema-drift
      // problems are diagnosable from the server log, not just a generic 500.
      if (exception instanceof Prisma.PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma ${exception.code}: ${exception.message} | meta=${JSON.stringify(exception.meta ?? {})}`,
        );
      } else {
        this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      }
    }
    res.status(status).json({ statusCode: status, error: HttpStatus[status], message });
  }
}
