import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  AppleLoginInput,
  CreateAdminInput,
  CustomerAuthRequestInput,
  CustomerAuthVerifyInput,
  EmailOnlySignupInput,
  FacebookLoginInput,
  GoogleLoginInput,
  LoginInput,
  LogoutInput,
  RefreshTokenInput,
  ResendOtpInput,
  SetAdminPasswordInput,
  VerifyOtpInput,
} from './auth.validation';
import {
  clearRefreshTokenCookie,
  getClientInfo,
  setRefreshTokenCookie,
  tokensForClient,
} from './auth.util';
import {
  DEFAULT_SESSION_DAYS,
  REFRESH_COOKIE_NAME,
  REMEMBER_ME_SESSION_DAYS,
} from './auth.constant';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';
import { ResetPasswordPayload } from './auth.interface';

export const requestCustomerAuthOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await AuthService.requestCustomerAuthOtp(req.body as CustomerAuthRequestInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code sent successfully',
    data: result,
  });
});

export const verifyCustomerAuthOtp = catchAsync(async (req: Request, res: Response) => {
  const clientInfo = {
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || 'unknown',
  };

  const result = await AuthService.verifyCustomerAuthOtp(
    req.body as CustomerAuthVerifyInput,
    clientInfo,
  );

  // If your issueSessionAndTokens sets HTTP-only refresh/access cookies, attach them here if needed
  sendResponse(res, {
    statusCode: result.isNewUser ? 201 : 200,
    success: true,
    message: result.isNewUser
      ? 'Account created and verified successfully'
      : 'Logged in successfully',
    data: {
      user: result.user,
      tokens: result.tokens,
      isNewUser: result.isNewUser,
    },
  });
});

const resendOtp = catchAsync(async (req, res) => {
  const result = await AuthService.resendSignupOtp(req.body as ResendOtpInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code resent successfully',
    data: result,
  });
});

const verifyOtp = catchAsync(async (req, res) => {
  const result = await AuthService.verifySignupOtp(req.body as VerifyOtpInput, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, 1);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Account verified and created successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const googleLogin = catchAsync(async (req, res) => {
  const input = req.body as GoogleLoginInput;
  const result = await AuthService.googleLogin(input, getClientInfo(req));

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in with Google successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const facebookLogin = catchAsync(async (req, res) => {
  const input = req.body as FacebookLoginInput;
  const result = await AuthService.facebookLogin(input, getClientInfo(req));

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in with Facebook successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const appleLogin = catchAsync(async (req, res) => {
  const input = req.body as AppleLoginInput;
  const result = await AuthService.appleLogin(input, getClientInfo(req));

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in with Apple successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const body = req.body as RefreshTokenInput;
  const token = body.refreshToken || cookies[REFRESH_COOKIE_NAME];

  const { tokens, rememberMe } = await AuthService.refreshAccessToken(token || '');

  setRefreshTokenCookie(
    res,
    tokens.refreshToken,
    rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Token refreshed successfully',
    data: {
      tokens: tokensForClient(req, tokens),
    },
  });
});

const logout = catchAsync(async (req, res) => {
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
  const body = req.body as LogoutInput;

  const result = await AuthService.logoutUser({
    sessionId: req.user?.sessionId,
    jti: req.user?.jti,
    userId: req.user?.id,
    refreshToken: body.refreshToken || cookies[REFRESH_COOKIE_NAME],
    fcmToken: body.fcmToken,
    clearFcmToken: body.clearFcmToken,
  });

  clearRefreshTokenCookie(res);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged out successfully',
    data: result,
  });
});

const driverInitiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as EmailOnlySignupInput, 'DRIVER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code sent successfully',
    data: result,
  });
});

const driverLogin = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['DRIVER']);

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const requestPasswordResetOtp = catchAsync(async (req, res) => {
  const result = await AuthService.requestPasswordResetOtp(req.body as ResetPasswordPayload);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset code sent successfully',
    data: {
      result,
    },
  });
});

const resetPassword = catchAsync(async (req, res) => {
  const result = await AuthService.resetPassword(
    req.body as { resetSessionId: string; otp: string; password: string },
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Password reset successfully',
    data: {
      result,
    },
  });
});

const fleetInitiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(
    req.body as EmailOnlySignupInput,
    'FLEET_MANAGER',
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code sent successfully',
    data: result,
  });
});

const fleetLogin = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['FLEET_MANAGER']);

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const adminLogin = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['ADMIN']);

  setRefreshTokenCookie(
    res,
    result.tokens.refreshToken,
    input.rememberMe ? REMEMBER_ME_SESSION_DAYS : DEFAULT_SESSION_DAYS,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Logged in successfully',
    data: {
      user: result.user,
      tokens: tokensForClient(req, result.tokens),
    },
  });
});

const createAdmin = catchAsync(async (req, res) => {
  const creator = { id: req.user!.id, role: req.user!.role };
  const result = await AuthService.createAdmin(req.body as CreateAdminInput, creator);

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Admin invitation sent successfully',
    data: result,
  });
});

const resendAdminInvite = catchAsync(async (req, res) => {
  const result = await AuthService.resendAdminInvite(req.body as { email: string });

  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: 'Admin invitation sent successfully',
    data: result,
  });
});

const setAdminPassword = catchAsync(async (req, res) => {
  const result = await AuthService.setAdminPassword(req.body as SetAdminPasswordInput);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Admin password set successfully',
    data: result,
  });
});

export const AuthController = {
  requestCustomerAuthOtp,
  verifyCustomerAuthOtp,
  resendOtp,
  verifyOtp,
  googleLogin,
  facebookLogin,
  appleLogin,
  refreshToken,
  logout,
  driverInitiateSignup,
  driverLogin,
  requestPasswordResetOtp,
  resetPassword,
  fleetInitiateSignup,
  fleetLogin,
  adminLogin,
  createAdmin,
  resendAdminInvite,
  setAdminPassword,
};
