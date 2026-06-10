import { Router } from "express";
import { requireOrganizationRole } from "../../middleware/auth";
import {
  renderGeneralSettings,
  renderLocalizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.use(requireOrganizationRole(["OWNER", "ADMIN"]));
settingsRouter.get("/", renderSettingsOverview);
settingsRouter.get("/general", renderGeneralSettings);
settingsRouter.get("/organization", renderOrganizationSettings);
settingsRouter.post("/organization", updateOrganizationSettingsController);
settingsRouter.get("/localization", renderLocalizationSettings);
settingsRouter.post("/localization", updateLocalizationSettingsController);
settingsRouter.get("/security", renderSecuritySettings);
settingsRouter.get("/organizations", renderOrganizationsSettings);
