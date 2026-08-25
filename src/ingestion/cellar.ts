import { XMLParser } from "fast-xml-parser";
import { normalizeCelex } from "../canonical/ids";

type XmlRecord = Record<string, unknown>;

export interface FmxDiscovery {
  workUri: string;
  expressionUri: string;
  manifestationUri: string;
  contentUrl: string;
  streamName: string;
  contentItems: Array<{
    contentUrl: string;
    streamName: string;
  }>;
}

function asRecord(value: unknown, context: string): XmlRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Cellar tree notice: expected ${context}`);
  }
  return value as XmlRecord;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || Array.isArray(node))
    return undefined;
  const value = (node as XmlRecord).VALUE;
  return typeof value === "string" ? value : undefined;
}

function uriOf(entity: unknown): string | undefined {
  const record = asRecord(entity, "entity");
  return textValue(record.URI);
}

function sameAsUris(entity: XmlRecord): string[] {
  return asArray(entity.SAMEAS)
    .map((sameAs) => textValue(asRecord(sameAs, "SAMEAS").URI))
    .filter((value): value is string => Boolean(value));
}

function expressionUsesLanguage(entity: XmlRecord, language: string): boolean {
  const wanted = language.toUpperCase();
  return asArray(entity.EXPRESSION_USES_LANGUAGE).some((value) => {
    const record = asRecord(value, "EXPRESSION_USES_LANGUAGE");
    const uri = textValue(record.URI);
    const code = record["OP-CODE"] ?? record.IDENTIFIER;
    return (
      uri?.endsWith(`/language/${wanted}`) === true ||
      (typeof code === "string" && code.toUpperCase() === wanted)
    );
  });
}

function expressionBelongsToWork(entity: XmlRecord, workUri: string): boolean {
  return asArray(entity.EXPRESSION_BELONGS_TO_WORK).some(
    (value) => uriOf(value) === workUri,
  );
}

export function officialCellarHttpsUrl(value: string): string {
  const url = new URL(value);
  if (url.hostname !== "publications.europa.eu") {
    throw new Error(`Unexpected Cellar host: ${url.hostname}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unexpected Cellar protocol: ${url.protocol}`);
  }
  url.protocol = "https:";
  return url.toString();
}

export function discoverEnglishFmx(
  treeNoticeXml: string,
  celexValue: string,
): FmxDiscovery {
  const celex = normalizeCelex(celexValue);
  const parsed = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    processEntities: false,
    trimValues: true,
  }).parse(treeNoticeXml) as unknown;
  const notice = asRecord(asRecord(parsed, "document").NOTICE, "NOTICE");
  const work = asRecord(notice.WORK, "WORK");
  const workUri = uriOf(work);

  const expressions = asArray(notice.EXPRESSION).map((value) =>
    asRecord(value, "EXPRESSION"),
  );
  const expression =
    expressions.find((candidate) =>
      sameAsUris(candidate).some((uri) => uri.endsWith(`/celex/${celex}.ENG`)),
    ) ??
    expressions.find(
      (candidate) =>
        expressionBelongsToWork(candidate, workUri ?? "") &&
        expressionUsesLanguage(candidate, "ENG"),
    );

  if (!workUri || !expression) {
    throw new Error(`English expression not found for CELEX ${celex}`);
  }

  const manifestationUris = new Set(
    asArray(expression.EXPRESSION_MANIFESTED_BY_MANIFESTATION)
      .map((link) => uriOf(link))
      .filter((value): value is string => Boolean(value)),
  );
  const manifestation = asArray(notice.MANIFESTATION)
    .map((value) => asRecord(value, "MANIFESTATION"))
    .find(
      (candidate) =>
        candidate["@_manifestation-type"] === "fmx4" &&
        Boolean(
          uriOf(candidate) && manifestationUris.has(uriOf(candidate) ?? ""),
        ),
    );

  if (!manifestation) {
    throw new Error(`FMX4 manifestation not found for CELEX ${celex}.ENG`);
  }

  const expressionUri = uriOf(expression);
  const manifestationUri = uriOf(manifestation);
  const items = asArray(manifestation.MANIFESTATION_HAS_ITEM).map((value) =>
    asRecord(value, "MANIFESTATION_HAS_ITEM"),
  );
  const streamNameOf = (candidate: XmlRecord) =>
    textValue(asRecord(candidate.TECHMD, "TECHMD").STREAM_NAME);
  const zipItem = items.find((candidate) =>
    streamNameOf(candidate)?.toLowerCase().endsWith(".zip"),
  );
  const xmlItems = items.filter((candidate) =>
    streamNameOf(candidate)?.toLowerCase().endsWith(".xml"),
  );
  const metadataBases = new Set(
    xmlItems
      .map((candidate) => streamNameOf(candidate))
      .filter(
        (name): name is string =>
          typeof name === "string" && name.toLowerCase().endsWith(".doc.xml"),
      )
      .map((name) => `${name.slice(0, -".doc.xml".length)}.xml`),
  );
  const legalXmlItems = xmlItems.filter((candidate) => {
    const name = streamNameOf(candidate)?.toLowerCase();
    return !name?.endsWith(".doc.xml") && !name?.endsWith(".toc.xml");
  });
  const actItem =
    legalXmlItems.find((candidate) =>
      metadataBases.has(streamNameOf(candidate) ?? ""),
    ) ?? legalXmlItems[0];
  const item =
    zipItem ??
    actItem ??
    items.find((candidate) => textValue(candidate.IDENTIFIER) === "DOC_1") ??
    asRecord(items[0], "MANIFESTATION_HAS_ITEM");
  const contentUrl = uriOf(item);
  const techMd = asRecord(item.TECHMD, "TECHMD");
  const streamName = textValue(techMd.STREAM_NAME);

  if (!expressionUri || !manifestationUri || !contentUrl || !streamName) {
    throw new Error(`Incomplete FMX4 content metadata for CELEX ${celex}.ENG`);
  }

  const selectedItems = zipItem
    ? [zipItem]
    : actItem
      ? [actItem, ...xmlItems.filter((candidate) => candidate !== actItem)]
      : [item];
  const contentItems = selectedItems.map((candidate) => {
    const candidateUrl = uriOf(candidate);
    const candidateStreamName = streamNameOf(candidate);
    if (!candidateUrl || !candidateStreamName) {
      throw new Error(`Incomplete FMX4 item metadata for CELEX ${celex}.ENG`);
    }
    if (!/^[a-zA-Z0-9._-]+$/u.test(candidateStreamName)) {
      throw new Error(
        `Unsafe FMX4 stream name for CELEX ${celex}.ENG: ${candidateStreamName}`,
      );
    }
    return {
      contentUrl: officialCellarHttpsUrl(candidateUrl),
      streamName: candidateStreamName,
    };
  });
  if (
    new Set(contentItems.map(({ streamName: name }) => name)).size !==
    contentItems.length
  ) {
    throw new Error(`Duplicate FMX4 stream name for CELEX ${celex}.ENG`);
  }

  return {
    workUri: officialCellarHttpsUrl(workUri),
    expressionUri: officialCellarHttpsUrl(expressionUri),
    manifestationUri: officialCellarHttpsUrl(manifestationUri),
    contentUrl: officialCellarHttpsUrl(contentUrl),
    streamName,
    contentItems,
  };
}

export function cellarTreeNoticeUrl(celexValue: string): string {
  const celex = normalizeCelex(celexValue);
  return `https://publications.europa.eu/resource/celex/${celex}?language=en`;
}
