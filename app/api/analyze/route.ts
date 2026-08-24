const schema = {
  type: "object", additionalProperties: false,
  required: ["ticker", "company", "currentPrice", "expectedPrice", "confidence", "summary", "scenarios", "signals", "sources"],
  properties: {
    ticker: { type: "string" }, company: { type: "string" }, currentPrice: { type: "number" }, expectedPrice: { type: "number" }, confidence: { type: "number" }, summary: { type: "string" },
    scenarios: { type: "array", minItems: 20, maxItems: 20, items: { type: "object", additionalProperties: false, required: ["name", "probability", "price", "thesis", "type"], properties: { name: { type: "string" }, probability: { type: "number" }, price: { type: "number" }, thesis: { type: "string" }, type: { type: "string", enum: ["bull", "base", "bear"] } } } },
    signals: { type: "array", minItems: 4, maxItems: 4, items: { type: "object", additionalProperties: false, required: ["label", "value", "tone", "detail"], properties: { label: { type: "string" }, value: { type: "string" }, tone: { type: "string", enum: ["good", "neutral", "bad"] }, detail: { type: "string" } } } },
    sources: { type: "array", minItems: 3, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["title", "publisher", "age", "url"], properties: { title: { type: "string" }, publisher: { type: "string" }, age: { type: "string" }, url: { type: "string" } } } },
  },
};

function outputText(payload: { output?: { content?: { type?: string; text?: string }[] }[] }) {
  for (const item of payload.output ?? []) for (const content of item.content ?? []) if (content.type === "output_text" && content.text) return content.text;
  throw new Error("Model returned no structured result");
}

export async function POST(request: Request) {
  const { ticker } = await request.json() as { ticker?: string };
  if (!ticker || !/^[A-Z.\-]{1,8}$/.test(ticker)) return Response.json({ error: "Invalid ticker" }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "Live research is not configured" }, { status: 503 });
  const prompt = `Act as an evidence-led public-equity scenario analyst. Research ${ticker} using current web sources. Identify the company and fresh stock price. Read or locate the last 10 quarterly/annual earnings reports, prioritizing SEC filings and investor relations. Evaluate revenue, margins, cash flow, balance sheet, guidance accuracy, consumer/customer sentiment, employee signals when material, competitive position, industry cycle, macro sensitivity, regulation, litigation, management/capital allocation, valuation, and tail risks. Create exactly 20 mutually exclusive scenarios for the stock price three years from today. Probabilities must be integers and sum to exactly 100. For every scenario estimate a three-year price from explicit business/valuation logic. Compute expectedPrice exactly as sum(probability * price) / 100. Distinguish facts from estimates. Do not imply certainty or give personalized investment advice. Sources must be direct, working URLs and favor primary sources.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-5.5", input: prompt, tools: [{ type: "web_search" }], include: ["web_search_call.action.sources"], reasoning: { effort: "medium" }, text: { format: { type: "json_schema", name: "stock_scenario_analysis", strict: true, schema } } }),
  });
  if (!response.ok) return Response.json({ error: "Research request failed", detail: await response.text() }, { status: 502 });
  const data = JSON.parse(outputText(await response.json()));
  const total = data.scenarios.reduce((sum: number, s: { probability: number }) => sum + s.probability, 0);
  const expected = data.scenarios.reduce((sum: number, s: { probability: number; price: number }) => sum + s.probability * s.price, 0) / 100;
  if (total !== 100 || Math.abs(expected - data.expectedPrice) > 0.1) return Response.json({ error: "Probability audit failed" }, { status: 422 });
  return Response.json({ ...data, live: true });
}
