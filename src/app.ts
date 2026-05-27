import path from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import flash from "connect-flash";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import morgan from "morgan";
import nunjucks from "nunjucks";
import { env } from "./config/env";
import { loadAuthContext, requireAuth } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { authRouter } from "./modules/auth/auth.routes";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes";
import { customerRouter } from "./modules/customers/customer.routes";
import { invoiceRouter } from "./modules/invoices/invoice.routes";
import { formatDate } from "./lib/dates";
import { formatMoney } from "./lib/money";

export const createApp = () => {
  const app = express();
  const viewsPath = path.join(process.cwd(), "src", "views");

  const nunjucksEnv = nunjucks.configure(viewsPath, {
    autoescape: true,
    express: app,
    noCache: env.NODE_ENV === "development",
  });

  nunjucksEnv.addFilter("money", formatMoney);
  nunjucksEnv.addFilter("date", formatDate);

  app.set("views", viewsPath);
  app.set("view engine", "njk");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    session({
      name: "invoice.sid",
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
      },
    }),
  );
  app.use(flash());
  app.use("/assets", express.static(path.join(process.cwd(), "src", "public", "assets")));
  app.use("/assets", express.static(path.join(process.cwd(), "public", "assets")));
  app.use(loadAuthContext);

  app.use((req, res, next) => {
    res.locals.flash = {
      success: req.flash("success"),
      error: req.flash("error"),
    };
    res.locals.currentPath = req.path;
    next();
  });

  app.use("/auth", authRouter);
  app.use(requireAuth);
  app.use("/", dashboardRouter);
  app.use("/customers", customerRouter);
  app.use("/invoices", invoiceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
