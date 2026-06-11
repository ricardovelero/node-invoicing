import type { RequestHandler } from "express";
import * as authService from "../auth/auth.service";
import {
  changePasswordSchema,
  type ChangePasswordErrors,
  createLocalizationSettingsValues,
  createOrganizationSettingsValues,
  createSecuritySettingsValues,
  type SecuritySettingsErrors,
  localizationSettingsSchema,
  organizationSettingsSchema,
  securitySettingsSchema,
} from "./settings.schema";
import {
  getWithholdingRateOptions,
  isSpanishIrpfEligible,
} from "../../lib/withholding";
import {
  updateLocalizationSettings,
  updateOrganizationSettings,
  updateSecuritySettings,
} from "./settings.service";

const valuesAreIrpfEligible = (values: ReturnType<typeof createOrganizationSettingsValues>) =>
  isSpanishIrpfEligible({
    countryCode: values.countryCode,
    legalForm: values.legalForm,
  });

const renderSecuritySettingsForm = (
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  {
    status = 200,
    timeoutErrors = {},
    passwordErrors = {},
  }: {
    status?: number;
    timeoutErrors?: SecuritySettingsErrors;
    passwordErrors?: ChangePasswordErrors;
  } = {},
) =>
  res.status(status).render("pages/settings/security.njk", {
    title: req.t("settings.sections.security.title"),
    activeSettingsPage: "security",
    values: createSecuritySettingsValues(req.auth!.organization),
    errors: timeoutErrors,
    passwordErrors,
  });

export const renderSettingsOverview: RequestHandler = (req, res) => {
  res.render("pages/settings/index.njk", {
    title: req.t("settings.title"),
    activeSettingsPage: "overview",
  });
};

export const renderGeneralSettings: RequestHandler = (req, res) => {
  res.render("pages/settings/general.njk", {
    title: req.t("settings.sections.general.title"),
    activeSettingsPage: "general",
  });
};

export const renderOrganizationSettings: RequestHandler = (req, res) => {
  const values = createOrganizationSettingsValues(req.auth!.organization);

  res.render("pages/settings/organization.njk", {
    title: req.t("settings.sections.organization.title"),
    activeSettingsPage: "organization",
    values,
    withholdingEligible: valuesAreIrpfEligible(values),
    withholdingRateOptions: getWithholdingRateOptions(values.countryCode),
    errors: {},
  });
};

export const updateOrganizationSettingsController: RequestHandler = async (req, res) => {
  const result = organizationSettingsSchema.safeParse(req.body);

  if (!result.success) {
    const values = createOrganizationSettingsValues(req.body);

    return res.status(422).render("pages/settings/organization.njk", {
      title: req.t("settings.sections.organization.title"),
      activeSettingsPage: "organization",
      values,
      withholdingEligible: valuesAreIrpfEligible(values),
      withholdingRateOptions: getWithholdingRateOptions(values.countryCode),
      errors: result.error.flatten().fieldErrors,
    });
  }

  await updateOrganizationSettings(req.auth!.organization.id, result.data);
  req.flash("success", req.t("settings.flash.updated"));
  res.redirect("/settings/organization");
};

export const renderLocalizationSettings: RequestHandler = (req, res) => {
  res.render("pages/settings/localization.njk", {
    title: req.t("settings.sections.localization.title"),
    activeSettingsPage: "localization",
    values: createLocalizationSettingsValues(req.auth!.organization),
    errors: {},
  });
};

export const updateLocalizationSettingsController: RequestHandler = async (req, res) => {
  const result = localizationSettingsSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render("pages/settings/localization.njk", {
      title: req.t("settings.sections.localization.title"),
      activeSettingsPage: "localization",
      values: createLocalizationSettingsValues(req.body),
      errors: result.error.flatten().fieldErrors,
    });
  }

  await updateLocalizationSettings(req.auth!.organization.id, result.data);
  req.flash("success", req.t("settings.flash.localizationUpdated"));
  res.redirect("/settings/localization");
};

export const renderSecuritySettings: RequestHandler = (req, res) => {
  return renderSecuritySettingsForm(req, res);
};

export const updateSecuritySettingsController: RequestHandler = async (req, res) => {
  const result = securitySettingsSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render("pages/settings/security.njk", {
      title: req.t("settings.sections.security.title"),
      activeSettingsPage: "security",
      values: createSecuritySettingsValues(req.body),
      errors: result.error.flatten().fieldErrors,
      passwordErrors: {},
    });
  }

  await updateSecuritySettings(req.auth!.organization.id, result.data);
  req.flash("success", req.t("settings.flash.securityUpdated"));
  res.redirect("/settings/security");
};

export const updatePasswordController: RequestHandler = async (req, res, next) => {
  const result = changePasswordSchema.safeParse(req.body);

  if (!result.success) {
    return renderSecuritySettingsForm(req, res, {
      status: 422,
      passwordErrors: result.error.flatten().fieldErrors,
    });
  }

  const passwordResult = await authService.changePassword({
    userId: req.auth!.user.id,
    currentPassword: result.data.currentPassword,
    newPassword: result.data.newPassword,
    currentSessionId: req.sessionID,
  });

  if (!passwordResult.ok && passwordResult.reason === "invalidCurrentPassword") {
    return renderSecuritySettingsForm(req, res, {
      status: 422,
      passwordErrors: {
        currentPassword: ["Current password is incorrect."],
      },
    });
  }

  if (!passwordResult.ok && passwordResult.reason === "userNotFound") {
    return renderSecuritySettingsForm(req, res, {
      status: 404,
      passwordErrors: {
        currentPassword: ["Unable to find your account."],
      },
    });
  }

  if (!passwordResult.ok) {
    return next(new Error("Unable to change password."));
  }

  req.flash("success", req.t("settings.flash.passwordUpdated"));
  return res.redirect("/settings/security");
};

export const renderOrganizationsSettings: RequestHandler = (req, res) => {
  res.render("pages/settings/organizations.njk", {
    title: req.t("settings.sections.organizations.title"),
    activeSettingsPage: "organizations",
  });
};
