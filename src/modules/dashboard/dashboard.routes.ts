import { Router } from "express";
import { renderDashboard } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/", renderDashboard);
