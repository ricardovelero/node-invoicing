import { Router } from "express";
import { requireOrganizationRole } from "../../middleware/auth";
import {
  renderOrganizationSettings,
  updateOrganizationSettingsController,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.use(requireOrganizationRole(["OWNER", "ADMIN"]));
settingsRouter.get("/", renderOrganizationSettings);
settingsRouter.post("/", updateOrganizationSettingsController);
