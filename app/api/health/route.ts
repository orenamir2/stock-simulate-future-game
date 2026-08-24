export async function GET() {
  return Response.json(
    { status: "ok", service: "possible", timestamp: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
