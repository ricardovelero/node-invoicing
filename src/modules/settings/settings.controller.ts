import type { RequestHandler } from "express";
import {
  createLocalizationSettingsValues,
  createOrganizationSettingsValues,
  localizationSettingsSchema,
  organizationSettingsSchema,
} from "./settings.schema";
import { isSpanishIrpfEligible } from "../../lib/withholding";
import {
  updateLocalizationSettings,
  updateOrganizationSettings,
} from "./settings.service";

const valuesAreIrpfEligible = (values: ReturnType<typeof createOrganizationSettingsValues>) =>
  isSpanishIrpfEligible({
    countryCode: values.countryCode,
    legalForm: values.legalForm,
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
    errors: {},
  });
};

export const updateOrganizationSettingsController: RequestHandler = async (req, res) => {
  const result = organizationSettingsSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render("pages/settings/organization.njk", {
      title: req.t("settings.sections.organization.title"),
      activeSettingsPage: "organization",
      values: createOrganizationSettingsValues(req.body),
      withholdingEligible: valuesAreIrpfEligible(
        createOrganizationSettingsValues(req.body),
      ),
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
  res.render("pages/settings/security.njk", {
    title: req.t("settings.sections.security.title"),
    activeSettingsPage: "security",
  });
};

export const renderOrganizationsSettings: RequestHandler = (req, res) => {
  res.render("pages/settings/organizations.njk", {
    title: req.t("settings.sections.organizations.title"),
    activeSettingsPage: "organizations",
  });
};
