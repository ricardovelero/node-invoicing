import type { RequestHandler } from "express";
import {
  createOrganizationSettingsValues,
  organizationSettingsSchema,
} from "./settings.schema";
import { updateOrganizationSettings } from "./settings.service";

export const renderOrganizationSettings: RequestHandler = (req, res) => {
  res.render("pages/settings/form.njk", {
    title: "Organization settings",
    values: createOrganizationSettingsValues(req.auth!.organization),
    errors: {},
  });
};

export const updateOrganizationSettingsController: RequestHandler = async (req, res) => {
  const result = organizationSettingsSchema.safeParse(req.body);

  if (!result.success) {
    return res.status(422).render("pages/settings/form.njk", {
      title: "Organization settings",
      values: createOrganizationSettingsValues(req.body),
      errors: result.error.flatten().fieldErrors,
    });
  }

  await updateOrganizationSettings(req.auth!.organization.id, result.data);
  req.flash("success", "Organization settings updated.");
  res.redirect("/settings");
};
