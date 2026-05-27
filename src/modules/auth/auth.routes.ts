import { Router } from "express";
import { loginUser, registerUser, renderLogin, renderRegister } from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post("/register", registerUser);

authRouter.get("/login", renderLogin);
authRouter.post("/login", loginUser);
