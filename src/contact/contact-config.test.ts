import { describe, expect, it } from "vitest";
import { loadContactMailConfig } from "./contact-config";

describe("contact mail configuration", () => {
  it("stays unavailable until recipient and SMTP credentials are complete", () => {
    expect(
      loadContactMailConfig({ CONTACT_TO_EMAIL: "team@example.com" }),
    ).toEqual({
      available: false,
    });
  });

  it("keeps the recipient in server configuration", () => {
    expect(
      loadContactMailConfig({
        CONTACT_TO_EMAIL: "team@example.com",
        CONTACT_SMTP_USER: "sender@example.com",
        CONTACT_SMTP_PASSWORD: "app-password",
      }),
    ).toEqual({
      available: true,
      config: {
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        user: "sender@example.com",
        password: "app-password",
        from: "sender@example.com",
        to: "team@example.com",
      },
    });
  });
});
