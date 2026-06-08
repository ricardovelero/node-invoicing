import type { RequestHandler } from "express";
import { getDashboardData } from "./dashboard.service";

export const renderDashboard: RequestHandler = async (req, res) => {
  const organization = req.auth!.organization;
  const dashboard = await getDashboardData(
    organization.id,
    organization.currency,
    organization.locale,
  );

  res.render("pages/dashboard.njk", {
    title: req.t("dashboard.title"),
    ...dashboard,
  });
};
