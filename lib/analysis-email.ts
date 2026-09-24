import { createTransport, type SentMessageInfo, type Transporter } from "nodemailer";
import type { Analysis } from "./analysis-types.ts";
import { analysisReportFilename, createAnalysisReportPdf } from "./pdf-report.ts";

export const DEFAULT_ANALYSIS_EMAIL_RECIPIENT = "orenamir2@gmail.com";

type Environment = Record<string, string | undefined>;

export type AnalysisEmailConfiguration = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string;
};

export class AnalysisEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisEmailConfigurationError";
  }
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) throw new AnalysisEmailConfigurationError(`${name} is not configured`);
  return trimmed;
}

export function analysisEmailConfiguration(
  environment: Environment = process.env,
): AnalysisEmailConfiguration {
  const port = Number(environment.SMTP_PORT ?? "587");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new AnalysisEmailConfigurationError("SMTP_PORT must be an integer between 1 and 65535");
  }

  const secureValue = environment.SMTP_SECURE?.trim().toLowerCase();
  if (secureValue !== undefined && secureValue !== "true" && secureValue !== "false") {
    throw new AnalysisEmailConfigurationError("SMTP_SECURE must be true or false");
  }

  const user = required(environment.SMTP_USER, "SMTP_USER");
  return {
    host: required(environment.SMTP_HOST, "SMTP_HOST"),
    port,
    secure: secureValue === undefined ? port === 465 : secureValue === "true",
    user,
    password: required(environment.SMTP_PASSWORD, "SMTP_PASSWORD"),
    from: environment.SMTP_FROM?.trim() || user,
    to: environment.ANALYSIS_EMAIL_TO?.trim() || DEFAULT_ANALYSIS_EMAIL_RECIPIENT,
  };
}

export function analysisEmailMessage(
  analysis: Analysis,
  configuration: Pick<AnalysisEmailConfiguration, "from" | "to">,
) {
  const filename = analysisReportFilename(analysis);
  return {
    from: configuration.from,
    to: configuration.to,
    subject: `Possible analysis: ${analysis.ticker} — ${analysis.company}`,
    text: [
      `Attached is the Possible three-year scenario analysis for ${analysis.company} (${analysis.ticker}).`,
      `Price as of: ${analysis.priceAsOf}`,
      "This report is not investment advice.",
    ].join("\n\n"),
    attachments: [{
      filename,
      content: Buffer.from(createAnalysisReportPdf(analysis)),
      contentType: "application/pdf",
    }],
  };
}

export async function sendAnalysisReportEmail(
  analysis: Analysis,
  options: {
    environment?: Environment;
    transporter?: Pick<Transporter, "sendMail">;
  } = {},
): Promise<{ messageId: string; recipient: string }> {
  const configuration = analysisEmailConfiguration(options.environment);
  const transporter = options.transporter ?? createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    auth: {
      user: configuration.user,
      pass: configuration.password,
    },
  });
  const result = await transporter.sendMail(
    analysisEmailMessage(analysis, configuration),
  ) as SentMessageInfo;
  return {
    messageId: typeof result.messageId === "string" ? result.messageId : "",
    recipient: configuration.to,
  };
}
