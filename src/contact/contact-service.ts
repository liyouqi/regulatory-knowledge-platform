import nodemailer from "nodemailer";
import type { ContactMailConfig } from "./contact-config";

export type ContactSubmission = {
  topic: "feedback" | "data_issue" | "question";
  message: string;
  replyEmail?: string;
  surface: "reader" | "monitor" | "galaxy" | "other";
  pageUrl: string;
  context?: string;
};

const topicLabels: Record<ContactSubmission["topic"], string> = {
  feedback: "Product feedback",
  data_issue: "Data issue",
  question: "Question",
};

export class ContactService {
  private readonly transporter;

  constructor(private readonly config: ContactMailConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
    });
  }

  async send(submission: ContactSubmission): Promise<void> {
    const subject = `[Regulatory Knowledge] ${topicLabels[submission.topic]} · ${submission.surface}`;
    const text = [
      topicLabels[submission.topic],
      `Surface: ${submission.surface}`,
      `Page: ${submission.pageUrl}`,
      submission.context ? `Context: ${submission.context}` : "",
      submission.replyEmail ? `Reply to: ${submission.replyEmail}` : "",
      "",
      submission.message,
    ]
      .filter((line) => line !== "")
      .join("\n");

    await this.transporter.sendMail({
      from: `Regulatory Knowledge <${this.config.from}>`,
      to: this.config.to,
      ...(submission.replyEmail ? { replyTo: submission.replyEmail } : {}),
      subject,
      text,
    });
  }
}
