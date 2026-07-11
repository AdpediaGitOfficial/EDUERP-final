import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../../common/decorators/current-user.decorator";

const REFRESH_COOKIE = "erp_refresh";

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.login(dto.email, dto.password);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user };
  }

  @Post("register")
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.register(dto.email, dto.password, dto.fullName);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user };
  }

  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post("reset-password")
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const { user, tokens } = await this.auth.resetPassword(dto.token, dto.password);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user };
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException("No refresh token");
    const { user, tokens } = await this.auth.refresh(token);
    setRefreshCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken, user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: AuthUser) {
    return this.auth.resolveSessionUser(user.id, user.email);
  }
}
