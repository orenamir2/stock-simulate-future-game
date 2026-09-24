import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisEmailConfigurationError,
  analysisEmailConfiguration,
  analysisEmailMessage,
  DEFAULT_ANALYSIS_EMAIL_RECIPIENT,
  sendAnalysisReportEmail,
} from "../lib/analysis-email.ts";
import { processAnalysis } from "../lib/analysis-engine.ts";
import { makeRawAnalysis } from "./analysis-fixture.ts";

const environment = {
  SMTP_HOST: "smtp.example.test",
  SMTP_PORT: "465",
  SMTP_USER: "sender@example.test",
  SMTP_PASSWORD: "test-password",
};

test("builds SMTP configuration with the issue recipient by default", () => {
  assert.deepEqual(analysisEmailConfiguration(environment), {
    host: "smtp.example.test",
    port: 465,
    secure: true,
    user: "sender@example.test",
    password: "test-password",
    from: "sender@example.test",
    to: DEFAULT_ANALYSIS_EMAIL_RECIPIENT,
  });
});

test("rejects incomplete SMTP configuration", () => {
  assert.throws(
    () => analysisEmailConfiguration({ SMTP_HOST: "smtp.example.test" }),
    AnalysisEmailConfigurationError,
  );
});

test("sends the generated PDF as an attachment", async () => {
  const analysis = processAnalysis(makeRawAnalysis(), "TEST", new Date("2025-01-01T00:00:00Z"));
  let sentMessage: ReturnType<typeof analysisEmailMessage> | undefined;
  const result = await sendAnalysisReportEmail(analysis, {
    environment,
    transporter: {
      sendMail: async (message) => {
        sentMessage = message as ReturnType<typeof analysisEmailMessage>;
        return { messageId: "message-123" };
      },
    },
  });

  assert.deepEqual(result, {
    messageId: "message-123",
    recipient: DEFAULT_ANALYSIS_EMAIL_RECIPIENT,
  });
  assert.equal(sentMessage?.to, DEFAULT_ANALYSIS_EMAIL_RECIPIENT);
  assert.equal(sentMessage?.attachments[0].contentType, "application/pdf");
  assert.match(sentMessage?.attachments[0].filename ?? "", /^possible-test-/);
  assert.ok((sentMessage?.attachments[0].content.length ?? 0) > 10_000);
});
