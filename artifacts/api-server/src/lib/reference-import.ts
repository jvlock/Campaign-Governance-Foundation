import fs from "node:fs";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";

export type ImportSource = "segments_workbook" | "taxonomy_workbook" | "utm_html";

export interface StagedCandidate {
  sourceLocation: string;
  category: string;
  sourceKey: string | null;
  sourceLabel: string;
  sourceDefinition: string | null;
  normalizedStableKey: string;
  rawPayload: Record<string, unknown>;
}

const sourceFiles: Record<ImportSource, string> = {
  segments_workbook: "Target_Segments_Personas_Cohorts_1787933333641.xlsx",
  taxonomy_workbook: "Taxonomy_Builder_Final_(1)_1787933333643.xlsm",
  utm_html: "MSCI_UTM_Guide_Public_3_1787933333643.html",
};

function referencePath(source: ImportSource) {
  const roots = [
    path.resolve(process.cwd(), "reference-materials"),
    path.resolve(process.cwd(), "../..", "reference-materials"),
  ];
  const root = roots.find((candidate) => fs.existsSync(path.join(candidate, sourceFiles[source])));
  if (!root) throw new Error(`Preserved source is unavailable: ${sourceFiles[source]}`);
  return path.join(root, sourceFiles[source]);
}

function text(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function stableKey(category: string, key: string) {
  const normalized = key
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase()
    .slice(0, 72);
  return `${category.toUpperCase()}_${normalized || "UNRESOLVED"}`;
}

function add(
  output: StagedCandidate[],
  seen: Set<string>,
  input: Omit<StagedCandidate, "normalizedStableKey">,
) {
  const sourceLabel = text(input.sourceLabel);
  if (!sourceLabel || sourceLabel.length > 160 || /^\d+(?:[.,]\d+)*%?$/.test(sourceLabel)) return;
  const sourceKey = text(input.sourceKey) || null;
  const dedupeKey = `${input.category}:${(sourceKey ?? sourceLabel).toLowerCase()}`;
  if (seen.has(dedupeKey)) return;
  seen.add(dedupeKey);
  output.push({
    ...input,
    sourceKey,
    sourceLabel,
    sourceDefinition: text(input.sourceDefinition) || null,
    normalizedStableKey: stableKey(input.category, sourceKey ?? sourceLabel),
  });
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function columnIndex(reference: string) {
  return [...reference].reduce((result, letter) => result * 26 + letter.charCodeAt(0) - 64, 0);
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function workbookRows(filePath: string, sheetName: string) {
  const files = unzipSync(fs.readFileSync(filePath));
  const readXml = (fileName: string) => {
    const content = files[fileName];
    if (!content) throw new Error(`Workbook part is missing: ${fileName}`);
    return strFromU8(content);
  };
  const workbookXml = readXml("xl/workbook.xml");
  const relationshipsXml = readXml("xl/_rels/workbook.xml.rels");
  const escapedName = sheetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sheetMatch = workbookXml.match(new RegExp(`<sheet\\b[^>]*name="${escapedName}"[^>]*(?:r:id|id)="([^"]+)"[^>]*/?>`));
  if (!sheetMatch) throw new Error(`Expected sheet is missing: ${sheetName}`);
  const relationshipId = sheetMatch[1];
  const relationship = [...relationshipsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)]
    .map((match) => match[1] ?? "")
    .find((attributes) => new RegExp(`\\bId="${relationshipId}"`).test(attributes));
  const target = relationship?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) throw new Error(`Worksheet relationship is missing: ${sheetName}`);
  const sheetPath = target.startsWith("/")
    ? target.slice(1)
    : path.posix.normalize(path.posix.join("xl", target));
  const sheetXml = readXml(sheetPath);
  const sharedStrings = files["xl/sharedStrings.xml"]
    ? [...readXml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textNodes(match[1] ?? ""))
    : [];
  const dimension = sheetXml.match(/<dimension\b[^>]*ref="(?:([A-Z]+)\d+:)?([A-Z]+)\d+"/);
  const firstColumn = columnIndex(dimension?.[1] ?? dimension?.[2] ?? "A");
  const rows = new Map<number, Map<number, unknown>>();
  for (const cellMatch of sheetXml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
    const attributes = cellMatch[1] ?? "";
    const body = cellMatch[2] ?? "";
    const reference = attributes.match(/\br="([A-Z]+)(\d+)"/);
    if (!reference) continue;
    const column = columnIndex(reference[1]);
    const row = Number(reference[2]);
    const type = attributes.match(/\bt="([^"]+)"/)?.[1];
    const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    let value: unknown = null;
    if (type === "s" && rawValue != null) value = sharedStrings[Number(rawValue)] ?? "";
    else if (type === "inlineStr") value = textNodes(body);
    else if (rawValue != null) value = decodeXml(rawValue);
    const rowValues = rows.get(row) ?? new Map<number, unknown>();
    rowValues.set(column, value);
    rows.set(row, rowValues);
  }
  if (!rows.size) return [];
  const firstRow = Math.min(...rows.keys());
  const lastRow = Math.max(...rows.keys());
  const lastColumn = Math.max(...[...rows.values()].flatMap((row) => [...row.keys()]));
  return Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) =>
    Array.from({ length: lastColumn - firstColumn + 1 }, (_, columnOffset) =>
      rows.get(firstRow + rowOffset)?.get(firstColumn + columnOffset) ?? null,
    ),
  );
}

function stageSegments(): StagedCandidate[] {
  const rows = workbookRows(referencePath("segments_workbook"), "Consol Messaging");
  const output: StagedCandidate[] = [];
  const seen = new Set<string>();
  const columns = [
    { index: 0, category: "subsegment" },
    { index: 1, category: "account_size_tier" },
    { index: 2, category: "persona" },
    { index: 3, category: "messaging_cohort" },
  ];
  rows.slice(1).forEach((row, offset) => {
    columns.forEach(({ index, category }) => add(output, seen, {
      sourceLocation: `Consol Messaging!R${offset + 2}C${index + 1}`,
      category,
      sourceKey: null,
      sourceLabel: text(row[index]),
      sourceDefinition: null,
      rawPayload: { sheet: "Consol Messaging", row: offset + 2, column: index + 1 },
    }));
  });
  return output;
}

function stageTaxonomyWorkbook(): StagedCandidate[] {
  const filePath = referencePath("taxonomy_workbook");
  const output: StagedCandidate[] = [];
  const seen = new Set<string>();
  const definitions = workbookRows(filePath, "Definitions");

  let contextualCategory = "messaging_cohort";
  definitions.forEach((row, index) => {
    const productKey = text(row[0]);
    const productDefinition = text(row[1]);
    if (productKey && productDefinition && productKey.length < 40 && !/product line/i.test(productKey)) {
      add(output, seen, {
        sourceLocation: `Definitions!R${index + 1}C1`,
        category: "product_family",
        sourceKey: productKey,
        sourceLabel: productKey,
        sourceDefinition: productDefinition,
        rawPayload: { sheet: "Definitions", row: index + 1, code: text(row[2]) || null },
      });
    }

    const label = text(row[4]);
    const code = text(row[5]);
    const definition = text(row[6]);
    const labelLower = label.toLowerCase();
    if (labelLower === "marketing_objective") contextualCategory = "marketing_objective";
    if (/audience|targeting/.test(labelLower) && !code) contextualCategory = "messaging_cohort";
    if (/activity/.test(labelLower) && !code) contextualCategory = "activity_type";
    if (label && code && !/dropdown code/i.test(code) && !/what |which |how /i.test(label)) {
      add(output, seen, {
        sourceLocation: `Definitions!R${index + 1}C5`,
        category: contextualCategory,
        sourceKey: code,
        sourceLabel: label,
        sourceDefinition: definition,
        rawPayload: { sheet: "Definitions", row: index + 1, code },
      });
    }
  });

  const channelRows = workbookRows(filePath, "Channel Grouping Logic");
  channelRows.slice(1).forEach((row, offset) => {
    const source = text(row[0]);
    const medium = text(row[1]);
    const channel = text(row[2]);
    const definition = text(row[3]);
    if (source) add(output, seen, {
      sourceLocation: `Channel Grouping Logic!R${offset + 2}C1`,
      category: "source",
      sourceKey: source,
      sourceLabel: source,
      sourceDefinition: definition,
      rawPayload: { sheet: "Channel Grouping Logic", row: offset + 2, medium, channel },
    });
    if (medium) add(output, seen, {
      sourceLocation: `Channel Grouping Logic!R${offset + 2}C2`,
      category: "delivery_mechanism",
      sourceKey: medium,
      sourceLabel: medium,
      sourceDefinition: definition,
      rawPayload: { sheet: "Channel Grouping Logic", row: offset + 2, source, channel },
    });
    if (channel) add(output, seen, {
      sourceLocation: `Channel Grouping Logic!R${offset + 2}C3`,
      category: "channel",
      sourceKey: null,
      sourceLabel: channel,
      sourceDefinition: definition,
      rawPayload: { sheet: "Channel Grouping Logic", row: offset + 2, source, medium },
    });
  });
  return output;
}

function stageHtml(): StagedCandidate[] {
  const html = fs.readFileSync(referencePath("utm_html"), "utf8");
  const output: StagedCandidate[] = [];
  const seen = new Set<string>();
  const card = /<div class="channel-meta"><h4>(.*?)<\/h4><div class="source-med">source\s*=\s*([^<&]+).*?medium\s*=\s*([^<&]+)<\/div>/gis;
  for (const match of html.matchAll(card)) {
    const channel = text(match[1]?.replace(/<[^>]+>/g, ""));
    const source = text(match[2]);
    const medium = text(match[3]);
    const location = `HTML channel card: ${channel}`;
    add(output, seen, { sourceLocation: location, category: "channel", sourceKey: null, sourceLabel: channel, sourceDefinition: null, rawPayload: { channel, source, medium } });
    add(output, seen, { sourceLocation: location, category: "source", sourceKey: source, sourceLabel: source, sourceDefinition: null, rawPayload: { channel, source, medium } });
    add(output, seen, { sourceLocation: location, category: "delivery_mechanism", sourceKey: medium, sourceLabel: medium, sourceDefinition: null, rawPayload: { channel, source, medium } });
  }
  if (!output.length) throw new Error("No governed candidates were found in the preserved HTML");
  return output;
}

export function stageReferenceSource(source: ImportSource) {
  if (source === "segments_workbook") return stageSegments();
  if (source === "taxonomy_workbook") return stageTaxonomyWorkbook();
  return stageHtml();
}