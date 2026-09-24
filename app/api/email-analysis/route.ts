import {
  AnalysisEmailConfigurationError,
  sendAnalysisReportEmail,
} from "../../../lib/analysis-email";
import { getAnalysisHistory } from "../../../lib/analysis-history";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { id?: unknown };
    if (typeof body.id !== "string" || body.id.length > 200) {
      return Response.json({ error: "A valid analysis history ID is required" }, { status: 400 });
    }

    const record = await getAnalysisHistory(body.id);
    if (!record) {
      return Response.json({ error: "Historical analysis not found" }, { status: 404 });
    }

    const delivery = await sendAnalysisReportEmail(record.analysis);
    console.info("Analysis report email sent", {
      analysisId: record.id,
      ticker: record.analysis.ticker,
      recipient: delivery.recipient,
      messageId: delivery.messageId,
    });
    return Response.json(
      { sent: true, recipient: delivery.recipient },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AnalysisEmailConfigurationError) {
      console.error("Analysis email is not configured", { errorMessage: error.message });
      return Response.json({ error: "Email delivery is not configured" }, { status: 503 });
    }
    console.error("Analysis report email failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "The analysis PDF could not be emailed" }, { status: 502 });
  }
}
