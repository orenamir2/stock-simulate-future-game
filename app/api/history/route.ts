import { getAnalysisHistory, listAnalysisHistory } from "../../../lib/analysis-history";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const record = await getAnalysisHistory(id);
      return record
        ? Response.json(record, { headers: { "Cache-Control": "no-store" } })
        : Response.json({ error: "Historical analysis not found" }, { status: 404 });
    }
    const requestedLimit = Number(url.searchParams.get("limit") ?? 200);
    const limit = Number.isInteger(requestedLimit) ? requestedLimit : 200;
    return Response.json(
      { items: await listAnalysisHistory(limit) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Analysis history request failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Analysis history is unavailable" }, { status: 500 });
  }
}
