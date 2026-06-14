import { Router } from "express";
import { requireOrganizationRole } from "../../middleware/auth";
import {
  createOrganizationController,
  renderGeneralSettings,
  renderLocalizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  revokeOtherSessionsController,
  revokeSessionController,
  switchOrganizationController,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updatePasswordController,
  updateSecuritySettingsController,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/organizations", renderOrganizationsSettings);
settingsRouter.post("/organizations", createOrganizationController);
settingsRouter.post("/organizations/switch", switchOrganizationController);

settingsRouter.use(requireOrganizationRole(["OWNER", "ADMIN"]));
settingsRouter.get("/", renderSettingsOverview);
settingsRouter.get("/general", renderGeneralSettings);
settingsRouter.get("/organization", renderOrganizationSettings);
settingsRouter.post("/organization", updateOrganizationSettingsController);
settingsRouter.get("/localization", renderLocalizationSettings);
settingsRouter.post("/localization", updateLocalizationSettingsController);
settingsRouter.get("/security", renderSecuritySettings);
settingsRouter.post("/security", updateSecuritySettingsController);
settingsRouter.post("/security/password", updatePasswordController);
settingsRouter.post("/security/sessions/revoke-others", revokeOtherSessionsController);
settingsRouter.post("/security/sessions/:sessionId/revoke", revokeSessionController);
