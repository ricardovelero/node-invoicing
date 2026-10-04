import { Router } from "express";
import { requireOrganizationRole } from "../../middleware/auth";
import { createAuthRateLimiter } from "../../middleware/rate-limit";
import {
  createOrganizationController,
  redirectGeneralSettings,
  redirectSecurityRateLimited,
  renderLocalizationSettings,
  renderNewOrganizationSettings,
  renderOrganizationSettings,
  renderOrganizationsSettings,
  renderProfileSettings,
  renderSecuritySettings,
  renderSettingsOverview,
  renderVerifactuSettings,
  removeVerifactuCertificateController,
  revokeOtherSessionsController,
  revokeSessionController,
  switchOrganizationController,
  updateProfileSettingsController,
  updateLocalizationSettingsController,
  updateOrganizationSettingsController,
  updatePasswordController,
  updateSecuritySettingsController,
  uploadVerifactuCertificateController,
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
settingsRouter.get("/verifactu", renderVerifactuSettings);
settingsRouter.post("/verifactu/certificate", uploadVerifactuCertificateController);
settingsRouter.post("/verifactu/certificate/delete", removeVerifactuCertificateController);
settingsRouter.get("/security", renderSecuritySettings);
settingsRouter.post("/security", updateSecuritySettingsController);
settingsRouter.post(
  "/security/password",
  createAuthRateLimiter(redirectSecurityRateLimited),
  updatePasswordController,
);
settingsRouter.post(
  "/security/sessions/revoke-others",
  createAuthRateLimiter(redirectSecurityRateLimited),
  revokeOtherSessionsController,
);
settingsRouter.post(
  "/security/sessions/:sessionId/revoke",
  createAuthRateLimiter(redirectSecurityRateLimited),
  revokeSessionController,
);
