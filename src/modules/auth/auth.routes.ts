import { Router } from "express";
import { loginUser, logoutUser, registerUser, renderLogin, renderRegister } from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post("/register", registerUser);

authRouter.get("/login", renderLogin);
authRouter.post("/login", loginUser);

authRouter.post("/logout", logoutUser);
