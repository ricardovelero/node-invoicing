import { Router } from "express";
import { handleRegister, loginUser, logoutUser, renderLogin, renderRegister } from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post("/register", handleRegister);

authRouter.get("/login", renderLogin);
authRouter.post("/login", loginUser);

authRouter.post("/logout", logoutUser);
