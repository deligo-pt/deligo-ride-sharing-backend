import { AuthService } from './auth.service';
import {
  AppleLoginInput,
  CreateAdminInput,
  EmailOnlySignupInput,
  FacebookLoginInput,
  GoogleLoginInput,
  InitiateSignupInput,
  LoginInput,
  RefreshTokenInput,
  ResendOtpInput,
  SetAdminPasswordInput,
  VerifyOtpInput,
} from './auth.validation';
import {
  clearRefreshTokenCookie,
  getClientInfo,
  REFRESH_COOKIE_NAME,
  setRefreshTokenCookie,
  tokensForClient,
} from './auth.util';
import { sendResponse } from '../../utils/sendResponse';
import { catchAsync } from '../../utils/catchAsync';

const initiateSignup = catchAsync(async (req, res) => {
  const result = await AuthService.initiateSignup(req.body as InitiateSignupInput, 'CUSTOMER');

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Verification code sent successfully',
    data: result,
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

const login = catchAsync(async (req, res) => {
  const input = req.body as LoginInput;
  const result = await AuthService.login(input, getClientInfo(req), ['CUSTOMER']);

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

const googleLogin = catchAsync(async (req, res) => {
  const input = req.body as GoogleLoginInput;
  const result = await AuthService.googleLogin(input, getClientInfo(req));

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

  setRefreshTokenCookie(res, tokens.refreshToken, rememberMe ? 30 : 1);

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
  const body = (req.body ?? {}) as { refreshToken?: string };

  const result = await AuthService.logoutUser({
    sessionId: req.user?.sessionId,
    jti: req.user?.jti,
    refreshToken: body.refreshToken || cookies[REFRESH_COOKIE_NAME],
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

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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

  setRefreshTokenCookie(res, result.tokens.refreshToken, input.rememberMe ? 30 : 1);

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
  initiateSignup,
  resendOtp,
  verifyOtp,
  login,
  googleLogin,
  facebookLogin,
  appleLogin,
  refreshToken,
  logout,
  driverInitiateSignup,
  driverLogin,
  fleetInitiateSignup,
  fleetLogin,
  adminLogin,
  createAdmin,
  setAdminPassword,
};
