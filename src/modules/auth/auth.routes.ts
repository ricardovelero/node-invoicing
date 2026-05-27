import { Router } from "express";
import { registerUser, renderRegister } from "./auth.controller";

export const authRouter = Router();

authRouter.get("/register", renderRegister);
authRouter.post("/register", registerUser);
