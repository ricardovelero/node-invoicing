import compression from 'compression';
import flash from 'connect-flash';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import nunjucks from 'nunjucks';
import { env } from './config/env';
import { prisma } from './db/prisma';
import { formatDate } from './lib/dates';
import { formatMoney } from './lib/money';
import { PrismaSessionStore } from './lib/session-store';
import { loadAuthContext, requireAuth } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { localeMiddleware } from './middleware/i18n';
import { captureSessionMetadata } from './middleware/session-metadata';
import { authRouter } from './modules/auth/auth.routes';
import { customerRouter } from './modules/customers/customer.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { invoiceRouter } from './modules/invoices/invoice.routes';
import { publicInvoiceRouter } from './modules/invoices/public-invoice.routes';
import { itemRouter } from './modules/items/item.routes';
import { settingsRouter } from './modules/settings/settings.routes';
import { postmarkWebhookRouter } from './modules/webhooks/postmark.routes';

export const createApp = () => {
  const app = express();
  const viewsPath = path.join(process.cwd(), 'src', 'views');
  const sessionMaxAgeMs = env.SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  const nunjucksEnv = nunjucks.configure(viewsPath, {
    autoescape: true,
    express: app,
    noCache: env.NODE_ENV === 'development',
  });

  nunjucksEnv.addFilter('money', formatMoney);
  nunjucksEnv.addFilter('date', formatDate);

  app.set('views', viewsPath);
  app.set('view engine', 'njk');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          scriptSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(compression());
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use('/webhooks', postmarkWebhookRouter);
  app.use(cookieParser());
  app.use(
    session({
      name: 'invoice.sid',
      secret: env.SESSION_SECRET,
      store: new PrismaSessionStore({
        session: prisma.session,
        maxAgeMs: sessionMaxAgeMs,
      }),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: sessionMaxAgeMs,
        sameSite: 'lax',
        secure: env.NODE_ENV === 'production',
      },
    }),
  );
  app.use(captureSessionMetadata);
  app.use(flash());
  app.use(
    '/assets',
    express.static(path.join(process.cwd(), 'src', 'public', 'assets')),
  );
  app.use(
    '/assets',
    express.static(path.join(process.cwd(), 'public', 'assets')),
  );
  app.use(loadAuthContext);
  app.use(localeMiddleware);
  app.use(csrfProtection);

  app.use((req, res, next) => {
    res.locals.appEnv = env.NODE_ENV;
    res.locals.flash = {
      success: req.flash('success'),
      error: req.flash('error'),
    };
    res.locals.currentPath = req.path;
    next();
  });

  app.use('/public/invoices', publicInvoiceRouter);
  app.use('/auth', authRouter);
  app.use(requireAuth);
  app.use('/', dashboardRouter);
  app.use('/settings', settingsRouter);
  app.use('/customers', customerRouter);
  app.use('/items', itemRouter);
  app.use('/invoices', invoiceRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
