/**
 * Canonical UTM guide catalog. The preserved guide is evidence only. This
 * loader accepts its data-literal grammar; it never executes HTML/JavaScript.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const UTM_GUIDE_SOURCE = "reference-materials/MSCI_UTM_Guide_Public_3_1787933333643.html";
export type GuideOption = { v: string; l: string };
export type GuideChannel = {
  id: string; name: string; source: string; medium: string; type: string;
  hasPaid: boolean; hasAds: boolean; hasEmail: boolean; hasCreative: boolean;
  hasOrg: boolean; hasApp: boolean; tbd: boolean; searchOnly?: boolean;
  isPartnerEmail?: boolean; isMcp?: boolean;
  targeting: { obj: boolean; aud: boolean; seg: boolean; reg: boolean };
};
export type UTMGuideCatalog = Record<string, unknown> & {
  productLines: GuideOption[];
  hierarchy: Record<string, Record<string, string[]>>;
  campaignLabels: Record<string, Record<string, string>>;
  subCampaignLabels: Record<string, Record<string, Record<string, string>>>;
  channels: GuideChannel[];
};

type Literal = string | boolean | null | Literal[] | { [key: string]: Literal };

/** A deliberately tiny data-literal parser (objects, arrays, strings/bools). */
function parseDataLiteral(input: string): Literal {
  let index = 0;
  const whitespace = () => { while (/\s/.test(input[index] ?? "")) index++; };
  const expect = (value: string) => {
    whitespace();
    if (!input.startsWith(value, index)) throw new Error(`Invalid UTM guide data near offset ${index}`);
    index += value.length;
  };
  const string = () => {
    whitespace();
    const quote = input[index++];
    let result = "";
    while (index < input.length && input[index] !== quote) {
      if (input[index] === "\\") {
        index++;
        const escaped = input[index++];
        result += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
      } else result += input[index++];
    }
    if (input[index++] !== quote) throw new Error("Unterminated UTM guide string");
    return result;
  };
  const word = () => {
    whitespace();
    const found = input.slice(index).match(/^[A-Za-z_$][\w$-]*/)?.[0];
    if (!found) throw new Error(`Expected UTM guide key near offset ${index}`);
    index += found.length;
    return found;
  };
  const value = (): Literal => {
    whitespace();
    if (input[index] === "'" || input[index] === "\"") return string();
    if (input[index] === "{") {
      index++;
      const object: Record<string, Literal> = {};
      whitespace();
      while (input[index] !== "}") {
        const key = input[index] === "'" || input[index] === "\"" ? string() : word();
        expect(":"); object[key] = value(); whitespace();
        if (input[index] === ",") { index++; whitespace(); } else if (input[index] !== "}") throw new Error("Invalid UTM guide object");
      }
      index++;
      return object;
    }
    if (input[index] === "[") {
      index++;
      const array: Literal[] = [];
      whitespace();
      while (input[index] !== "]") {
        array.push(value()); whitespace();
        if (input[index] === ",") { index++; whitespace(); } else if (input[index] !== "]") throw new Error("Invalid UTM guide array");
      }
      index++;
      return array;
    }
    const token = word();
    if (token === "true") return true;
    if (token === "false") return false;
    if (token === "null") return null;
    throw new Error(`Unsupported UTM guide literal ${token}`);
  };
  const result = value();
  whitespace();
  if (index !== input.length) throw new Error("Unexpected UTM guide data suffix");
  return result;
}

export function loadCanonicalUtmGuide(): UTMGuideCatalog {
  // Resolve from this source file so `pnpm --filter @workspace/scripts run`
  // works just as reliably as invocation from the repository root.
  const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const text = readFileSync(resolve(repositoryRoot, UTM_GUIDE_SOURCE), "utf8");
  const match = text.match(/const T = (\{[\s\S]*?\n\});/);
  if (!match) throw new Error(`Unable to find canonical taxonomy data in ${UTM_GUIDE_SOURCE}`);
  return parseDataLiteral(match[1]) as UTMGuideCatalog;
}

export const guideCategoryDefinitions = [
  ["product_line", "Product line", false],
  ["campaign_shortcode", "Campaign shortcode", true],
  ["subcampaign", "Subcampaign", true],
  ["ads_subtype", "Ads subtype", false], ["utm_objective", "Objective", false],
  ["audience", "Audience", false], ["audience_segment", "Audience segment", false],
  ["utm_region", "UTM region", false], ["creative_type", "Creative type", false],
  ["image_size", "Image size", false], ["gif_size", "GIF size", false],
  ["video_length", "Video length", false], ["content_type", "Content type", false],
  ["creative_cta", "Creative CTA", false], ["content_order", "Content order", false],
  ["email_type", "Email type", false], ["partner_email_type", "Partner email type", false],
  ["owner", "Owner", false], ["capture_source", "Capture source", false],
  ["newsletter_version", "Newsletter version", false], ["link_position", "Link position", false],
  ["nurture_sequence", "Nurture sequence", false], ["form_interest", "Form interest", false],
  ["form_newsletter", "Form newsletter", false], ["display_partner", "Display partner", false],
  ["app_source", "App source", false],
] as const;