import type { Analysis } from "./analysis-types";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

type Font = "regular" | "bold";

type Page = {
  commands: string[];
};

function ascii(value: string) {
  return value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u00d7/g, "x")
    .replace(/\u221e/g, "infinity")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return ascii(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, size: number, maxWidth: number, font: Font = "regular") {
  const words = ascii(value).split(" ").filter(Boolean);
  const widthFactor = font === "bold" ? 0.56 : 0.51;
  const maxCharacters = Math.max(1, Math.floor(maxWidth / (size * widthFactor)));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      line = "";
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function money(value: number, currency: string, digits = 2) {
  return `${currency} ${value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })}`;
}

function percent(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

class ReportCanvas {
  readonly pages: Page[] = [];
  private readonly analysis: Analysis;
  private page!: Page;
  private y = 0;
  private pageNumber = 0;

  constructor(analysis: Analysis) {
    this.analysis = analysis;
    this.newPage();
  }

  private newPage() {
    this.pageNumber += 1;
    this.page = { commands: [] };
    this.pages.push(this.page);
    this.y = PAGE_HEIGHT - MARGIN - 28;
    this.text("POSSIBLE", MARGIN, PAGE_HEIGHT - 31, 9, "bold", [0.09, 0.1, 0.08]);
    this.text(`${this.analysis.ticker}  /  THREE-YEAR SCENARIO REPORT`, MARGIN + 66, PAGE_HEIGHT - 31, 7, "regular", [0.42, 0.44, 0.4]);
    this.text(`PAGE ${this.pageNumber}`, PAGE_WIDTH - MARGIN - 34, PAGE_HEIGHT - 31, 7, "bold", [0.42, 0.44, 0.4]);
    this.line(MARGIN, PAGE_HEIGHT - 39, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 39, 0.5, [0.78, 0.77, 0.72]);
    this.line(MARGIN, 35, PAGE_WIDTH - MARGIN, 35, 0.5, [0.78, 0.77, 0.72]);
    this.text("Not investment advice. Scenario outputs are uncertain estimates.", MARGIN, 22, 7, "regular", [0.42, 0.44, 0.4]);
  }

  private ensure(height: number) {
    if (this.y - height < 48) this.newPage();
  }

  private text(value: string, x: number, y: number, size: number, font: Font = "regular", color: [number, number, number] = [0.09, 0.1, 0.08]) {
    const fontName = font === "bold" ? "F2" : "F1";
    this.page.commands.push(
      `BT /${fontName} ${size} Tf ${color.join(" ")} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdfText(value)}) Tj ET`,
    );
  }

  private line(x1: number, y1: number, x2: number, y2: number, width = 0.5, color: [number, number, number] = [0.09, 0.1, 0.08]) {
    this.page.commands.push(`${color.join(" ")} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`);
  }

  private rect(x: number, y: number, width: number, height: number, fill: [number, number, number], stroke: [number, number, number] = fill) {
    this.page.commands.push(`${fill.join(" ")} rg ${stroke.join(" ")} RG ${x} ${y} ${width} ${height} re B`);
  }

  heading(kicker: string, title: string, detail?: string) {
    this.ensure(detail ? 72 : 57);
    this.text(kicker.toUpperCase(), MARGIN, this.y, 7, "bold", [0.42, 0.44, 0.4]);
    this.y -= 24;
    this.text(title, MARGIN, this.y, 21, "bold");
    this.y -= 16;
    if (detail) {
      const lines = wrapText(detail, 8, CONTENT_WIDTH);
      for (const line of lines) {
        this.text(line, MARGIN, this.y, 8, "regular", [0.35, 0.37, 0.33]);
        this.y -= 11;
      }
    }
    this.y -= 10;
  }

  overview() {
    this.text("ANALYSIS REPORT", MARGIN, this.y, 8, "bold", [0.42, 0.44, 0.4]);
    this.y -= 31;
    this.text(this.analysis.company, MARGIN, this.y, 27, "bold");
    this.y -= 20;
    this.text(`${this.analysis.ticker} / ${this.analysis.exchange} / ${this.analysis.shareClass}`, MARGIN, this.y, 8, "regular", [0.35, 0.37, 0.33]);
    this.y -= 13;
    this.text(`Price as of ${formatTimestamp(this.analysis.priceAsOf)} / Fiscal data through ${this.analysis.fiscalDataAsOf}`, MARGIN, this.y, 8, "regular", [0.35, 0.37, 0.33]);
    this.y -= 28;

    const gap = 8;
    const cardWidth = (CONTENT_WIDTH - gap * 3) / 4;
    const cards = [
      ["PRICE TODAY", money(this.analysis.currentPrice, this.analysis.tradingCurrency), "Timestamped reference"],
      ["EXPECTED PRICE", money(this.analysis.expectedPrice, this.analysis.tradingCurrency), "Probability weighted"],
      ["3Y TOTAL RETURN", percent(this.analysis.expectedTotalReturnPct), `${percent(this.analysis.expectedAnnualizedReturnPct)} annualized`],
      ["CONFIDENCE", `${this.analysis.confidence}/100`, "Evidence coverage"],
    ];
    cards.forEach(([label, value, note], index) => {
      const x = MARGIN + index * (cardWidth + gap);
      const fill: [number, number, number] = index === 1 ? [0.85, 1, 0.24] : index === 0 ? [0.09, 0.1, 0.08] : [0.98, 0.98, 0.96];
      const ink: [number, number, number] = index === 0 ? [1, 1, 1] : [0.09, 0.1, 0.08];
      this.rect(x, this.y - 76, cardWidth, 76, fill, [0.09, 0.1, 0.08]);
      this.text(label, x + 9, this.y - 14, 6, "bold", ink);
      this.text(value, x + 9, this.y - 43, 15, "bold", ink);
      this.text(note, x + 9, this.y - 65, 6, "regular", index === 0 ? [0.75, 0.76, 0.72] : [0.42, 0.44, 0.4]);
    });
    this.y -= 98;

    const ranges = this.analysis.scenarios.reduce((total, scenario) => {
      total[scenario.type] += scenario.probability;
      return total;
    }, { bull: 0, base: 0, bear: 0 });
    this.text("OUTCOME DISTRIBUTION", MARGIN, this.y, 7, "bold", [0.42, 0.44, 0.4]);
    this.y -= 18;
    let x = MARGIN;
    const colors: Record<keyof typeof ranges, [number, number, number]> = {
      bear: [0.87, 0.4, 0.31],
      base: [0.45, 0.55, 0.64],
      bull: [0.66, 0.8, 0.15],
    };
    (["bear", "base", "bull"] as const).forEach((type) => {
      const width = CONTENT_WIDTH * (ranges[type] / 100);
      this.rect(x, this.y - 10, width, 10, colors[type]);
      x += width;
    });
    this.y -= 24;
    this.text(`BEAR ${ranges.bear.toFixed(1)}%     BASE ${ranges.base.toFixed(1)}%     BULL ${ranges.bull.toFixed(1)}%`, MARGIN, this.y, 7, "bold");
    this.y -= 21;
    for (const line of wrapText(this.analysis.summary, 10, CONTENT_WIDTH)) {
      this.text(line, MARGIN, this.y, 10, "regular", [0.28, 0.3, 0.27]);
      this.y -= 14;
    }
    this.y -= 16;

    this.text("SIGNALS", MARGIN, this.y, 7, "bold", [0.42, 0.44, 0.4]);
    this.y -= 17;
    const signalWidth = (CONTENT_WIDTH - 12) / 2;
    this.analysis.signals.forEach((signal, index) => {
      if (index === 2) this.y -= 60;
      const rowIndex = index % 2;
      const signalX = MARGIN + rowIndex * (signalWidth + 12);
      const signalY = index < 2 ? this.y : this.y;
      this.rect(signalX, signalY - 49, signalWidth, 49, [0.98, 0.98, 0.96], [0.78, 0.77, 0.72]);
      this.text(signal.label.toUpperCase(), signalX + 9, signalY - 12, 6, "bold", [0.42, 0.44, 0.4]);
      this.text(signal.value, signalX + 9, signalY - 27, 10, "bold");
      this.text(wrapText(signal.detail, 6, signalWidth - 18)[0], signalX + 9, signalY - 40, 6, "regular", [0.35, 0.37, 0.33]);
    });
    this.y -= 67;
  }

  scenarios() {
    this.heading("Scenario book", "20 ways the next three years unfold", "Non-overlapping terminal-price buckets, ordered by terminal price. Prices and returns are server-derived from explicit assumptions.");
    const drawHeader = () => {
      this.text("#", MARGIN, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.text("SCENARIO", MARGIN + 24, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.text("TYPE", MARGIN + 300, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.text("PROB.", MARGIN + 356, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.text("3Y PRICE", MARGIN + 410, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.text("RETURN", MARGIN + 476, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.y -= 10;
      this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, 0.8);
      this.y -= 13;
    };
    drawHeader();
    this.analysis.scenarios.forEach((scenario, index) => {
      if (this.y - 28 < 48) {
        this.newPage();
        drawHeader();
      }
      this.text(String(index + 1).padStart(2, "0"), MARGIN, this.y, 7, "regular", [0.42, 0.44, 0.4]);
      this.text(ascii(scenario.name).slice(0, 45), MARGIN + 24, this.y, 8, "bold");
      this.text(scenario.type.toUpperCase(), MARGIN + 300, this.y, 7, "bold");
      this.text(`${scenario.probability.toFixed(1)}%`, MARGIN + 356, this.y, 8);
      this.text(money(scenario.price, this.analysis.tradingCurrency, 0), MARGIN + 410, this.y, 8, "bold");
      this.text(percent(scenario.totalReturnPct, 0), MARGIN + 476, this.y, 8, "bold", scenario.totalReturnPct >= 0 ? [0.36, 0.47, 0.06] : [0.7, 0.25, 0.18]);
      this.y -= 11;
      this.text(ascii(scenario.thesis).slice(0, 96), MARGIN + 24, this.y, 6, "regular", [0.42, 0.44, 0.4]);
      this.y -= 12;
      this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, 0.35, [0.82, 0.81, 0.77]);
      this.y -= 10;
    });
    this.y -= 12;
  }

  evidence() {
    this.newPage();
    this.heading("Evidence scorecard", "The questions behind the probability", "Category scores, coverage strength, unresolved questions, and representative findings from the current analysis.");
    this.analysis.research.forEach((finding) => {
      const lineCount = wrapText(finding.finding, 8, CONTENT_WIDTH - 56).length;
      const height = 38 + lineCount * 10 + Math.min(finding.unansweredQuestions.length, 2) * 9;
      this.ensure(height);
      this.rect(MARGIN, this.y - height + 8, 38, height - 8, finding.score > 0 ? [0.88, 0.95, 0.63] : finding.score < 0 ? [0.96, 0.78, 0.74] : [0.87, 0.86, 0.82]);
      this.text(`${finding.score > 0 ? "+" : ""}${finding.score}`, MARGIN + 13, this.y - 17, 12, "bold");
      this.text(finding.categoryId.replace(/-/g, " ").toUpperCase(), MARGIN + 52, this.y, 8, "bold");
      this.text(`EVIDENCE ${finding.evidenceStrength}/3`, PAGE_WIDTH - MARGIN - 69, this.y, 7, "bold", [0.42, 0.44, 0.4]);
      this.y -= 14;
      for (const line of wrapText(finding.finding, 8, CONTENT_WIDTH - 56)) {
        this.text(line, MARGIN + 52, this.y, 8, "regular", [0.28, 0.3, 0.27]);
        this.y -= 10;
      }
      if (finding.unansweredQuestions.length) {
        this.text(`OPEN: ${finding.unansweredQuestions.slice(0, 2).join(" / ")}`, MARGIN + 52, this.y - 2, 6, "regular", [0.65, 0.28, 0.2]);
        this.y -= 11 * Math.min(finding.unansweredQuestions.length, 2);
      }
      this.y -= 10;
      this.line(MARGIN + 52, this.y, PAGE_WIDTH - MARGIN, this.y, 0.35, [0.82, 0.81, 0.77]);
      this.y -= 12;
    });
  }

  sources() {
    this.newPage();
    this.heading("Source ledger", "Traceable by design", "Published and access dates, source classification, and document URLs used by this analysis.");
    this.analysis.sources.forEach((source) => {
      const urlLines = wrapText(source.url, 6, CONTENT_WIDTH - 28);
      const height = 35 + urlLines.length * 8;
      this.ensure(height);
      this.text(`[${source.id}] ${source.title}`, MARGIN, this.y, 9, "bold");
      this.y -= 12;
      this.text(`${source.publisher} / published ${source.publishedAt} / accessed ${formatTimestamp(source.accessedAt)} / ${source.type} / ${source.primary ? "Primary" : "Secondary"}`, MARGIN, this.y, 6, "regular", [0.42, 0.44, 0.4]);
      this.y -= 10;
      for (const line of urlLines) {
        this.text(line, MARGIN, this.y, 6, "regular", [0.2, 0.3, 0.42]);
        this.y -= 8;
      }
      this.y -= 7;
      this.line(MARGIN, this.y, PAGE_WIDTH - MARGIN, this.y, 0.35, [0.82, 0.81, 0.77]);
      this.y -= 11;
    });
  }
}

function createPdfDocument(pages: Page[], title: string) {
  const objects: string[] = [];
  const addObject = (value: string) => {
    objects.push(value);
    return objects.length;
  };

  const catalogId = addObject("");
  const pagesId = addObject("");
  const regularFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const boldFontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  for (const page of pages) {
    const content = `${page.commands.join("\n")}\n`;
    const contentId = addObject(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  const infoId = addObject(`<< /Title (${escapePdfText(title)}) /Author (Possible) /Creator (Possible Scenario Engine) /Subject (Probability-weighted stock analysis) >>`);
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n%Possible\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

export function createAnalysisReportPdf(analysis: Analysis) {
  const report = new ReportCanvas(analysis);
  report.overview();
  report.scenarios();
  report.evidence();
  report.sources();
  return createPdfDocument(report.pages, `${analysis.company} (${analysis.ticker}) analysis report`);
}

export function analysisReportFilename(analysis: Analysis) {
  const date = analysis.priceAsOf.slice(0, 10).replace(/[^0-9-]/g, "") || "analysis";
  return `possible-${analysis.ticker.toLowerCase()}-${date}.pdf`;
}
