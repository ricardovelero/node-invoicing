import { chromium } from 'playwright';

type GenerateInvoicePdfOptions = {
  cookieHeader?: string;
  printUrl: string;
};

const cookiesFromHeader = (cookieHeader: string | undefined, url: string) => {
  if (!cookieHeader) {
    return [];
  }

  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const separatorIndex = cookie.indexOf('=');

      if (separatorIndex === -1) {
        return null;
      }

      const name = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();

      if (!name) {
        return null;
      }

      return { name, value, url };
    })
    .filter((cookie): cookie is { name: string; value: string; url: string } =>
      Boolean(cookie),
    );
};

export const generateInvoicePdfFromPrintUrl = async ({
  cookieHeader,
  printUrl,
}: GenerateInvoicePdfOptions) => {
  const browser = await chromium.launch();

  try {
    const context = await browser.newContext();
    const cookies = cookiesFromHeader(cookieHeader, printUrl);

    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    try {
      const page = await context.newPage();

      await page.goto(printUrl, { waitUntil: 'networkidle' });

      return await page.pdf({
        format: 'A4',
        printBackground: true,
        scale: 0.9,
      });
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
};
