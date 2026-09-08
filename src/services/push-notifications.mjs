import webPush from "web-push";

export const DEFAULT_NOTIFICATION_TIME = "18:00";
export const DEFAULT_NOTIFICATION_TIME_ZONE = "Europe/Brussels";

const zonedFormatters = new Map();

export function generateVapidKeys() {
  return webPush.generateVAPIDKeys();
}

export function validDeliveryTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value ?? ""));
}

export function validTimeZone(value) {
  const timeZone = String(value ?? "").trim();
  if (!timeZone || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function zonedDateAndTime(date, timeZone) {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    zonedFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function summaryBody(locale, count) {
  const amount = Number(count);
  if (locale === "nl") return `${amount} nieuwe ${amount === 1 ? "melding" : "meldingen"} in ParcOS`;
  if (locale === "en") return `${amount} new ${amount === 1 ? "update" : "updates"} in ParcOS`;
  return `${amount} ${amount === 1 ? "nouveauté" : "nouveautés"} dans ParcOS`;
}

export function permanentPushFailure(error) {
  return [404, 410].includes(Number(error?.statusCode));
}

export async function sendWebPush(subscription, payload, vapidDetails) {
  return webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 12 * 60 * 60,
    urgency: "normal",
    vapidDetails,
  });
}
