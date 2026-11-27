export class AgricultureError extends Error {
  constructor(code, field = null, status = 400) {
    super(field ? `${code}: ${field}` : code);
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

export function invalid(field) {
  throw new AgricultureError("invalid", field);
}

export function object(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value;
}

export function string(value, field, { required = false, max = 500 } = {}) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || value.length > max) invalid(field);
  const result = value.trim();
  if (!result && required) invalid(field);
  return result || null;
}

export function choice(value, field, choices) {
  if (!choices.includes(value)) invalid(field);
  return value;
}

export function number(value, field, { min = 0, max = 1e9, integer = false } = {}) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) invalid(field);
  return value;
}

export function key(value, field = "id") {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) invalid(field);
  return value;
}

export function day(value, field, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field);
  const date = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) invalid(field);
  return value;
}

export function list(value, field, convert, max = 50) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max) invalid(field);
  return value.map((item) => convert(item, field));
}

export function source(value) {
  const data = object(value, "source");
  const url = string(data.url, "source.url", { max: 1000 });
  if (url) {
    const target = URL.parse(url);
    if (!target || !["https:", "http:"].includes(target.protocol) || target.username || target.password) invalid("source.url");
  }
  return {
    title: string(data.title, "source.title", { required: true, max: 200 }),
    url,
    retrievedOn: day(data.retrievedOn, "source.retrievedOn"),
  };
}

export function atomic(db, execute) {
  db.exec("begin immediate");
  try {
    const result = execute();
    db.exec("commit");
    return result;
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
}

export const LOCALES = ["fr", "nl", "en"];
export const fold = (value) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
