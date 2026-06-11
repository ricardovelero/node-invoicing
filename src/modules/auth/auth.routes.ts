import { Router } from "express";
import { createAuthRateLimiter } from "../../middleware/rate-limit";
import {
  handleForgotPassword,
  handleRegister,
  handleResetPassword,
  loginUser,
  logoutUser,
  renderForgotPassword,
  renderForgotPasswordRateLimited,
  renderLogin,
  renderLoginRateLimited,
  renderRegister,
  renderRegisterRateLimited,
  renderResetPassword,
  renderResetPasswordRateLimited,
} from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post(
  "/register",
  createAuthRateLimiter(renderRegisterRateLimited),
  handleRegister,
);

authRouter.get("/login", renderLogin);
authRouter.post(
  "/login",
  createAuthRateLimiter(renderLoginRateLimited),
  loginUser,
);

authRouter.get("/forgot", renderForgotPassword);
authRouter.post(
  "/forgot",
  createAuthRateLimiter(renderForgotPasswordRateLimited),
  handleForgotPassword,
);

authRouter.get("/reset/:token", renderResetPassword);
authRouter.post(
  "/reset/:token",
  createAuthRateLimiter(renderResetPasswordRateLimited),
  handleResetPassword,
);

authRouter.post("/logout", logoutUser);
