export const defaultSessionIdleTimeoutMinutes = 30;
export const defaultSessionAbsoluteLifetimeDays = 14;

export const minSessionIdleTimeoutMinutes = 5;
export const maxSessionIdleTimeoutMinutes = 24 * 60;
export const minSessionAbsoluteLifetimeDays = 1;
export const maxSessionAbsoluteLifetimeDays = 90;

export const minutesToMs = (minutes: number) => minutes * 60 * 1000;
export const daysToMs = (days: number) => days * 24 * 60 * 60 * 1000;
