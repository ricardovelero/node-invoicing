import { Router } from "express";
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
authRouter.post("/register", handleRegister);

authRouter.get("/login", renderLogin);
authRouter.post("/login", loginUser);

authRouter.get("/forgot", renderForgotPassword);
authRouter.post("/forgot", handleForgotPassword);

authRouter.get("/reset/:token", renderResetPassword);
authRouter.post("/reset/:token", handleResetPassword);

authRouter.post("/logout", logoutUser);
