export type ContactMailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};

export type ContactConfigResult =
  | { available: true; config: ContactMailConfig }
  | { available: false };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function loadContactMailConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ContactConfigResult {
  const to = environment.CONTACT_TO_EMAIL?.trim() ?? "";
  const user = environment.CONTACT_SMTP_USER?.trim() ?? "";
  const password = environment.CONTACT_SMTP_PASSWORD?.trim() ?? "";
  const port = Number.parseInt(environment.CONTACT_SMTP_PORT ?? "465", 10);
  if (
    !emailPattern.test(to) ||
    !emailPattern.test(user) ||
    !password ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535
  ) {
    return { available: false };
  }
  return {
    available: true,
    config: {
      host: environment.CONTACT_SMTP_HOST?.trim() || "smtp.gmail.com",
      port,
      secure: port === 465,
      user,
      password,
      from: environment.CONTACT_SMTP_FROM?.trim() || user,
      to,
    },
  };
}
