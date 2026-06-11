import { Router } from "express";
import { authRateLimiter } from "../../middleware/rate-limit";
import {
  handleForgotPassword,
  handleRegister,
  handleResetPassword,
  loginUser,
  logoutUser,
  renderForgotPassword,
  renderLogin,
  renderRegister,
  renderResetPassword,
} from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post("/register", authRateLimiter, handleRegister);

authRouter.get("/login", renderLogin);
authRouter.post("/login", authRateLimiter, loginUser);

authRouter.get("/forgot", renderForgotPassword);
authRouter.post("/forgot", authRateLimiter, handleForgotPassword);

authRouter.get("/reset/:token", renderResetPassword);
authRouter.post("/reset/:token", authRateLimiter, handleResetPassword);

authRouter.post("/logout", logoutUser);
