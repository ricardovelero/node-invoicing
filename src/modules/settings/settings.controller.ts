import type { RequestHandler } from "express";
import * as authService from "../auth/auth.service";
import {
  changePasswordSchema,
  type ChangePasswordErrors,
  createOrganizationSchema,
  createOrganizationValuesSchema,
  createLocalizationSettingsValues,
  createOrganizationSettingsValues,
  createSecuritySettingsValues,
  type CreateOrganizationErrors,
  type CreateOrganizationValues,
  type OrganizationSettingsErrors,
  type OrganizationSettingsValues,
  type SecuritySettingsErrors,
  localizationSettingsSchema,
  organizationSettingsSchema,
  securitySettingsSchema,
  switchOrganizationSchema,
  supportedCurrencies,
} from "./settings.schema";
import { supportedOrganizationCountryCodes } from "../../lib/countries";
import { daysToMs } from "../../lib/session-policy";
import {
  customRateType,
  getWithholdingRateOptions,
  isSpanishIrpfEligible,
  legalForms,
} from "../../lib/withholding";
import {
  getActiveSessionsForUser,
  getOrganizationsForUser,
  createOrganizationForUser,
  revokeOtherSessionsForUser,
  revokeSessionForUser,
  switchOrganizationForUser,
  updateLocalizationSettings,
  updateOrganizationSettings,
  updateSecuritySettings,
  type ActiveSession,
  type OrganizationMembershipView,
} from "./settings.service";

type Request = Parameters<RequestHandler>[0];
type Response = Parameters<RequestHandler>[1];
type SelectOption = { value: string; label: string };

const countryLabels: Record<
  (typeof supportedOrganizationCountryCodes)[number],
  string
> = {
  ES: "Spain",
  GB: "United Kingdom",
  US: "United States of America",
};

const legalFormTranslationKeys: Record<(typeof legalForms)[number], string> = {
  sole_trader: "settings.legalForms.soleTrader",
  company: "settings.legalForms.company",
  other: "settings.legalForms.other",
};

const valuesAreIrpfEligible = (values: ReturnType<typeof createOrganizationSettingsValues>) =>
  isSpanishIrpfEligible({
    countryCode: values.countryCode,
    legalForm: values.legalForm,
  });

const getCountryOptions = (_req: Request): SelectOption[] =>
  supportedOrganizationCountryCodes.map((countryCode) => ({
    value: countryCode,
    label: countryLabels[countryCode],
  }));

const getCurrencyOptions = (): SelectOption[] =>
  supportedCurrencies.map((currency) => ({
    value: currency,
    label: currency,
  }));

const getLegalFormOptions = (req: Request): SelectOption[] =>
  legalForms.map((legalForm) => ({
    value: legalForm,
    label: req.t(legalFormTranslationKeys[legalForm]),
  }));

const getWithholdingRateTypeOptions = (
  countryCode: string,
  req: Request,
): SelectOption[] => [
  ...getWithholdingRateOptions(countryCode),
  { value: customRateType, label: req.t("settings.withholding.customRate") },
];

const createOrganizationSettingsViewModel = (
  req: Request,
  values: OrganizationSettingsValues,
  errors: OrganizationSettingsErrors = {},
) => ({
  title: req.t("settings.sections.organization.title"),
  activeSettingsPage: "organization",
  values,
  withholdingEligible: valuesAreIrpfEligible(values),
  withholdingRateOptions: getWithholdingRateOptions(values.countryCode),
  withholdingRateTypeOptions: getWithholdingRateTypeOptions(
    values.countryCode,
    req,
  ),
  countryOptions: getCountryOptions(req),
  currencyOptions: getCurrencyOptions(),
  legalFormOptions: getLegalFormOptions(req),
  errors,
});

const getAuditContext = (req: Request) => ({
  ip: req.ip ?? null,
  userAgent: req.get("user-agent") ?? null,
  sessionId: req.sessionID ?? null,
});

const assignActiveOrganizationSession = (
  req: Request,
  organization: {
    organizationId: string;
    sessionIdleTimeoutMinutes: number;
    sessionAbsoluteLifetimeDays: number;
  },
) => {
  req.session.organizationId = organization.organizationId;
  req.session.sessionIdleTimeoutMinutes = organization.sessionIdleTimeoutMinutes;
  req.session.sessionAbsoluteLifetimeDays =
    organization.sessionAbsoluteLifetimeDays;
  req.session.cookie.maxAge = daysToMs(
    organization.sessionAbsoluteLifetimeDays,
  );
};

const getSafeReturnPath = (path: string | undefined) =>
  path && path.startsWith("/") && !path.startsWith("//") ? path : "/";

const createOrganizationMembershipViews = (
  memberships: OrganizationMembershipView[],
  currentOrganizationId: string,
) =>
  memberships.map((membership) => ({
    ...membership,
    isCurrent: membership.organizationId === currentOrganizationId,
  }));

const createOrganizationsViewModel = async (
  req: Request,
  values: Partial<CreateOrganizationValues> = {},
  errors: CreateOrganizationErrors = {},
) => {
  const memberships = await getOrganizationsForUser(req.auth!.user.id);

  return {
    title: req.t("settings.sections.organizations.title"),
    activeSettingsPage: "organizations",
    currentOrganization: req.auth!.organization,
    memberships: createOrganizationMembershipViews(
      memberships,
      req.auth!.organization.id,
    ),
    values,
    errors,
  };
};

type SecuritySessionView = ActiveSession & {
  createdAtDisplay: string;
  createdAtIso: string;
  expiresAtDisplay: string;
  expiresAtIso: string;
  lastSeenAtDisplay: string;
  lastSeenAtIso: string;
};

const formatDateTime = (date: Date, locale = "en-GB") =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);

const createSecuritySessionViews = (
  sessions: ActiveSession[],
  locale: string,
): SecuritySessionView[] =>
  sessions.map((session) => ({
    ...session,
    createdAtDisplay: formatDateTime(session.createdAt, locale),
    createdAtIso: session.createdAt.toISOString(),
    expiresAtDisplay: formatDateTime(session.expiresAt, locale),
    expiresAtIso: session.expiresAt.toISOString(),
    lastSeenAtDisplay: formatDateTime(session.lastSeenAt, locale),
    lastSeenAtIso: session.lastSeenAt.toISOString(),
  }));

const renderSecuritySettingsForm = async (
  req: Request,
  res: Response,
  {
    status = 200,
    values = createSecuritySettingsValues(req.auth!.organization),
    timeoutErrors = {},
    passwordErrors = {},
  }: {
    status?: number;
    values?: ReturnType<typeof createSecuritySettingsValues>;
    timeoutErrors?: SecuritySettingsErrors;
    passwordErrors?: ChangePasswordErrors;
  } = {},
) => {
  const activeSessions = await getActiveSessionsForUser(
    req.auth!.user.id,
    req.sessionID,
  );

  return res.status(status).render("pages/settings/security.njk", {
    title: req.t("settings.sections.security.title"),
    activeSettingsPage: "security",
    values,
    errors: timeoutErrors,
    passwordErrors,
    sessions: createSecuritySessionViews(
      activeSessions,
      req.auth!.organization.locale,
    ),
  });
};

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

  res.render(
    "pages/settings/organization.njk",
    createOrganizationSettingsViewModel(req, values),
  );
};

export const updateOrganizationSettingsController: RequestHandler = async (req, res) => {
  const result = organizationSettingsSchema.safeParse(req.body);

  if (!result.success) {
    const values = createOrganizationSettingsValues(req.body);

    return res.status(422).render(
      "pages/settings/organization.njk",
      createOrganizationSettingsViewModel(
        req,
        values,
        result.error.flatten().fieldErrors,
      ),
    );
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

export const renderSecuritySettings: RequestHandler = async (req, res) => {
  return renderSecuritySettingsForm(req, res);
};

export const updateSecuritySettingsController: RequestHandler = async (req, res) => {
  const result = securitySettingsSchema.safeParse(req.body);

  if (!result.success) {
    return renderSecuritySettingsForm(req, res, {
      status: 422,
      values: createSecuritySettingsValues(req.body),
      timeoutErrors: result.error.flatten().fieldErrors,
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

  await authService.recordAuthAuditEvent({
    type: "PASSWORD_CHANGED",
    userId: req.auth!.user.id,
    organizationId: req.auth!.organization.id,
    ...getAuditContext(req),
  });

  req.flash("success", req.t("settings.flash.passwordUpdated"));
  return res.redirect("/settings/security");
};

export const revokeSessionController: RequestHandler = async (req, res) => {
  const sessionId = Array.isArray(req.params.sessionId)
    ? req.params.sessionId[0]
    : req.params.sessionId;

  if (!sessionId) {
    req.flash("error", req.t("settings.flash.sessionNotRevoked"));
    return res.redirect("/settings/security");
  }

  const result = await revokeSessionForUser(
    req.auth!.user.id,
    sessionId,
    req.sessionID,
  );

  if (result.revoked) {
    await authService.recordAuthAuditEvent({
      type: "SESSION_REVOKED",
      userId: req.auth!.user.id,
      organizationId: req.auth!.organization.id,
      ...getAuditContext(req),
      metadata: {
        targetSessionId: sessionId,
      },
    });
    req.flash("success", req.t("settings.flash.sessionRevoked"));
  } else {
    req.flash("error", req.t("settings.flash.sessionNotRevoked"));
  }

  return res.redirect("/settings/security");
};

export const revokeOtherSessionsController: RequestHandler = async (req, res) => {
  const result = await revokeOtherSessionsForUser(
    req.auth!.user.id,
    req.sessionID,
  );

  await authService.recordAuthAuditEvent({
    type: "SESSION_REVOKED",
    userId: req.auth!.user.id,
    organizationId: req.auth!.organization.id,
    ...getAuditContext(req),
    metadata: {
      scope: "otherSessions",
      revokedCount: result.revokedCount,
    },
  });

  req.flash(
    "success",
    req.t("settings.flash.otherSessionsRevoked", {
      count: result.revokedCount,
    }),
  );
  return res.redirect("/settings/security");
};

export const renderOrganizationsSettings: RequestHandler = async (req, res) => {
  res.render(
    "pages/settings/organizations.njk",
    await createOrganizationsViewModel(req),
  );
};

export const createOrganizationController: RequestHandler = async (req, res, next) => {
  const result = createOrganizationSchema.safeParse(req.body);
  const values = createOrganizationValuesSchema.parse(req.body);

  if (!result.success) {
    return res.status(422).render(
      "pages/settings/organizations.njk",
      await createOrganizationsViewModel(
        req,
        values,
        result.error.flatten().fieldErrors,
      ),
    );
  }

  try {
    const organization = await createOrganizationForUser(
      req.auth!.user.id,
      result.data,
    );

    assignActiveOrganizationSession(req, organization);
    req.flash("success", req.t("settings.flash.organizationCreated"));
    return res.redirect("/settings/organizations");
  } catch (error) {
    return next(error);
  }
};

export const switchOrganizationController: RequestHandler = async (req, res, next) => {
  const result = switchOrganizationSchema.safeParse(req.body);
  const returnPath = getSafeReturnPath(
    typeof req.body.returnTo === "string" ? req.body.returnTo : undefined,
  );

  if (!result.success) {
    req.flash("error", req.t("settings.flash.organizationNotSwitched"));
    return res.redirect(returnPath);
  }

  try {
    const organization = await switchOrganizationForUser(
      req.auth!.user.id,
      result.data.organizationId,
    );

    if (!organization.ok) {
      req.flash("error", req.t("settings.flash.organizationNotSwitched"));
      return res.redirect(returnPath);
    }

    assignActiveOrganizationSession(req, organization);
    req.flash("success", req.t("settings.flash.organizationSwitched"));
    return res.redirect(returnPath);
  } catch (error) {
    return next(error);
  }
};
