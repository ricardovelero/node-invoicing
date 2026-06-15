import { Router } from "express";
import { requireOrganizationRole } from "../../middleware/auth";
import {
  createOrganizationController,
  redirectGeneralSettings,
  renderLocalizationSettings,
  renderNewOrganizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderProfileSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  revokeOtherSessionsController,
  revokeSessionController,
  switchOrganizationController,
  updateProfileSettingsController,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updatePasswordController,
  updateSecuritySettingsController,
} from "./settings.controller";

export const settingsRouter = Router();

settingsRouter.get("/organizations", renderOrganizationsSettings);
settingsRouter.get("/organizations/new", renderNewOrganizationSettings);
settingsRouter.post("/organizations", createOrganizationController);
settingsRouter.post("/organizations/switch", switchOrganizationController);
settingsRouter.get("/profile", renderProfileSettings);
settingsRouter.post("/profile", updateProfileSettingsController);
settingsRouter.get("/general", redirectGeneralSettings);

settingsRouter.use(requireOrganizationRole(["OWNER", "ADMIN"]));
settingsRouter.get("/", renderSettingsOverview);
settingsRouter.get("/organization", renderOrganizationSettings);
settingsRouter.post("/organization", updateOrganizationSettingsController);
settingsRouter.get("/localization", renderLocalizationSettings);
settingsRouter.post("/localization", updateLocalizationSettingsController);
settingsRouter.get("/security", renderSecuritySettings);
settingsRouter.post("/security", updateSecuritySettingsController);
settingsRouter.post("/security/password", updatePasswordController);
settingsRouter.post("/security/sessions/revoke-others", revokeOtherSessionsController);
settingsRouter.post("/security/sessions/:sessionId/revoke", revokeSessionController);
