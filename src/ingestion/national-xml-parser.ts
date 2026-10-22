import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { type ContentUnit, contentUnitsText } from "../shared/content-unit";
import type { NationalSourceSnapshot } from "./national-snapshot";
import type { NationalSourceDefinition } from "./national-source-registry";

export const NATIONAL_XML_PARSER_VERSION = "1.1.0";
export type NationalXmlUnit =
  | { type: "text"; text: string; locator: string }
  | {
      type: "element";
      name: string;
      attributes: Record<string, string>;
      locator: string;
      children: NationalXmlUnit[];
    };
type ElementUnit = Extract<NationalXmlUnit, { type: "element" }>;
type ParsedItem = Record<string, unknown>;
const allowed: Record<string, string[]> = {
  dokumente: ["doknr", "builddate"],
  norm: ["doknr", "builddate"],
  metadaten: [],
  jurabk: [],
  amtabk: [],
  "ausfertigung-datum": ["manuell"],
  fundstelle: ["typ"],
  periodikum: [],
  zitstelle: [],
  kurzue: [],
  langue: [],
  standangabe: ["checked"],
  standtyp: [],
  standkommentar: [],
  textdaten: [],
  fussnoten: [],
  Content: [],
  P: [],
  BR: [],
  pre: ["xml:space"],
  enbez: [],
  text: ["format"],
  TOC: [],
  Ident: ["Class"],
  Title: ["Align", "Class"],
  table: ["tocentry", "colsep", "frame", "pgwide", "rowsep"],
  tgroup: ["char", "charoff", "cols", "align", "colsep", "rowsep"],
  colspec: ["colname", "colwidth", "colnum", "align"],
  tbody: ["valign"],
  row: ["rowsep"],
  entry: [
    "colname",
    "VJ",
    "colsep",
    "rowsep",
    "align",
    "valign",
    "namest",
    "nameend",
  ],
  gliederungseinheit: [],
  gliederungskennzahl: [],
  gliederungsbez: [],
  gliederungstitel: [],
  titel: ["format"],
  DL: ["Type", "Font", "Indent"],
  DT: [],
  DD: ["Font"],
  LA: ["Size"],
  NB: [],
  I: [],
  B: [],
  SP: [],
  noindex: [],
  kommentar: ["typ"],
};
const childrenAllowed: Record<string, string[]> = {
  dokumente: ["norm"],
  norm: ["metadaten", "textdaten"],
  metadaten: [
    "amtabk",
    "ausfertigung-datum",
    "enbez",
    "fundstelle",
    "gliederungseinheit",
    "jurabk",
    "kurzue",
    "langue",
    "standangabe",
    "titel",
  ],
  fundstelle: ["periodikum", "zitstelle"],
  standangabe: ["standkommentar", "standtyp"],
  textdaten: ["fussnoten", "text"],
  fussnoten: ["Content"],
  Content: ["BR", "P", "TOC"],
  P: ["BR", "DL", "I", "NB", "noindex", "pre", "table"],
  pre: ["BR"],
  text: ["Content", "TOC"],
  table: ["tgroup"],
  tgroup: ["colspec", "tbody"],
  tbody: ["row"],
  row: ["entry"],
  entry: ["BR", "DL", "NB"],
  DL: ["DD", "DT"],
  DD: ["LA"],
  LA: ["DL", "I", "NB"],
  gliederungseinheit: [
    "gliederungsbez",
    "gliederungskennzahl",
    "gliederungstitel",
  ],
  titel: ["BR"],
  noindex: ["kommentar"],
  kommentar: ["BR"],
  TOC: ["Ident", "P", "Title", "table"],
  Ident: ["B", "SP"],
  Title: ["B", "BR", "SP"],
  B: ["BR"],
  SP: ["BR"],
};
const textParents = new Set(
  "jurabk amtabk ausfertigung-datum periodikum zitstelle kurzue langue standtyp standkommentar P pre enbez entry DT LA gliederungskennzahl gliederungsbez gliederungstitel titel NB I kommentar Ident Title B SP".split(
    " ",
  ),
);
function units(
  items: ParsedItem[],
  parent: string,
  parentName?: string,
): NationalXmlUnit[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const keys = Object.keys(item).filter((k) => k !== ":@");
    if (keys.length !== 1) throw new Error(`Unexpected XML node at ${parent}`);
    const name = keys[0];
    const index = (seen.get(name) ?? 0) + 1;
    seen.set(name, index);
    const locator = `${parent}/${name === "\u0023text" ? "text()" : name}[${index}]`;
    if (name === "#text") {
      if (
        String(item[name]).trim() &&
        (!parentName || !textParents.has(parentName))
      )
        throw new Error(`Unexpected direct XML text in ${parentName}`);
      return { type: "text", text: String(item[name]), locator };
    }
    if (!(name in allowed))
      throw new Error(`Unsupported XML element ${name} at ${locator}`);
    if (parentName && !(childrenAllowed[parentName] ?? []).includes(name))
      throw new Error(`Unsupported XML child ${name} in ${parentName}`);
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      (item[":@"] ?? {}) as Record<string, unknown>,
    )) {
      const attr = key.replace(/^@_/u, "");
      if (!allowed[name].includes(attr))
        throw new Error(`Unsupported XML attribute ${name}@${attr}`);
      attrs[attr] = String(value);
    }
    for (const key of ["colsep", "rowsep"]) {
      if (attrs[key] !== undefined && !["0", "1"].includes(attrs[key]))
        throw new Error(`Unsupported ${name}@${key}`);
    }
    if (!Array.isArray(item[name]))
      throw new Error(`Invalid XML node ${locator}`);
    return {
      type: "element",
      name,
      attributes: attrs,
      locator,
      children: units(item[name] as ParsedItem[], locator, name),
    };
  });
}
const children = (e: ElementUnit, name: string): ElementUnit[] =>
  e.children.filter(
    (x): x is ElementUnit => x.type === "element" && x.name === name,
  );
const child = (e: ElementUnit, name: string): ElementUnit | undefined =>
  children(e, name)[0];
export function nationalUnitText(unit: NationalXmlUnit): string {
  if (unit.type === "text") return unit.text;
  if (unit.name === "BR") return "\n";
  return unit.children.map(nationalUnitText).join("");
}
const value = (e: ElementUnit, name: string) => {
  const result = child(e, name);
  return result ? nationalUnitText(result) : undefined;
};
export interface NationalXmlNorm {
  sourceId: string;
  locator: string;
  label?: string;
  title?: string;
  group?: { code: string; label: string; title: string };
  structuralPath: string[];
  text?: ElementUnit;
  footnotes?: ElementUnit;
}
export function inspectNationalXml(
  bytes: Uint8Array,
  snapshot: NationalSourceSnapshot,
  source: NationalSourceDefinition,
) {
  if (
    snapshot.localId !== source.localId ||
    snapshot.documentId !== source.documentId ||
    snapshot.canonicalUrl !== source.pageUrl ||
    snapshot.content.url !== source.contentUrl
  )
    throw new Error("Snapshot does not match national registry");
  if (
    `sha256:${createHash("sha256").update(bytes).digest("hex")}` !==
    snapshot.content.sha256
  )
    throw new Error("National XML checksum mismatch");
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!ENTITY\b/iu.test(xml))
    throw new Error("XML entity declarations are not permitted");
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`Invalid national XML: ${valid.err.msg}`);
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  }).parse(xml) as ParsedItem[];
  const roots = parsed.filter((x) => Object.hasOwn(x, "dokumente"));
  if (
    roots.length !== 1 ||
    parsed.some(
      (x) => !Object.hasOwn(x, "dokumente") && !Object.hasOwn(x, "?xml"),
    )
  )
    throw new Error("Unexpected national XML root");
  const root = units(roots, "")[0];
  if (root.type !== "element" || root.attributes.doknr !== source.sourceWorkId)
    throw new Error("National work identity mismatch");
  const all = children(root, "norm");
  if (all.length !== root.children.filter((x) => x.type === "element").length)
    throw new Error("Unexpected national root content");
  const ids = new Set<string>();
  const stack: { code: string; sourceId: string }[] = [];
  const norms: NationalXmlNorm[] = [];
  for (const n of all) {
    const sourceId = n.attributes.doknr;
    if (
      !sourceId ||
      !sourceId.startsWith(source.sourceWorkId) ||
      ids.has(sourceId)
    )
      throw new Error(`Invalid or duplicate norm ID ${sourceId}`);
    ids.add(sourceId);
    if (
      children(n, "metadaten").length !== 1 ||
      children(n, "textdaten").length !== 1
    )
      throw new Error("Ambiguous norm containers");
    const meta = child(n, "metadaten");
    const data = child(n, "textdaten");
    if (!meta || !data)
      throw new Error(`Missing norm metadata or textdata ${sourceId}`);
    for (const [container, repeatable] of [
      [meta, new Set(["jurabk", "fundstelle", "standangabe"])],
      [data, new Set<string>()],
    ] as const) {
      const counts = new Map<string, number>();
      for (const unit of container.children)
        if (unit.type === "element") {
          const count = (counts.get(unit.name) ?? 0) + 1;
          counts.set(unit.name, count);
          if (count > 1 && !repeatable.has(unit.name))
            throw new Error(`Ambiguous duplicate ${unit.name}`);
        }
    }
    const group = child(meta, "gliederungseinheit");
    let groupData: NationalXmlNorm["group"];
    if (group) {
      const code = value(group, "gliederungskennzahl");
      const label = value(group, "gliederungsbez");
      const title = value(group, "gliederungstitel");
      if (!code || !label || !title || !/^\d{3}(?:\d{3})*$/u.test(code))
        throw new Error(`Invalid group ${sourceId}`);
      const depth = code.length / 3;
      while (stack.length >= depth) stack.pop();
      if (
        depth > 1 &&
        (stack.length !== depth - 1 ||
          stack[stack.length - 1].code !== code.slice(0, -3))
      )
        throw new Error(`Ambiguous group ancestry ${sourceId}`);
      groupData = { code, label, title };
      stack.push({ code, sourceId });
    }
    norms.push({
      sourceId,
      locator: n.locator,
      label: value(meta, "enbez"),
      title: value(meta, "titel"),
      group: groupData,
      structuralPath: stack.map((x) => x.sourceId),
      text: child(data, "text"),
      footnotes: child(data, "fussnoten"),
    });
  }
  const header = child(all[0], "metadaten");
  if (
    !header ||
    value(header, "langue") !== source.officialTitle ||
    value(header, "ausfertigung-datum") !== source.enactmentDate
  )
    throw new Error(
      "National XML title or enactment date differs from registry",
    );
  const stand = children(header, "standangabe").map((x) => ({
    type: value(x, "standtyp"),
    text: value(x, "standkommentar"),
  }));
  const currentStand = stand.filter((s) => s.type === "Stand");
  const lastDate = currentStand[0]?.text?.match(
    /v\.\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/u,
  );
  if (
    currentStand.length !== 1 ||
    !lastDate ||
    `${lastDate[3]}-${lastDate[2].padStart(2, "0")}-${lastDate[1].padStart(2, "0")}` !==
      source.lastAmendmentDate
  )
    throw new Error(
      "National source Stand date differs from reviewed registry",
    );
  return { root, norms, stand };
}

type ContentRole = "operative-text" | "source-note" | "toc";
type ProjectedUnit =
  | {
      type: "text";
      text: string;
      sourceLocator: { kind: "xpath"; value: string };
      contentRole: ContentRole;
    }
  | {
      type: "element";
      name:
        | "group"
        | "paragraph"
        | "list"
        | "list-item"
        | "list-marker"
        | "table"
        | "row"
        | "cell"
        | "emphasis"
        | "line-break";
      sourceName: string;
      sourceAttributes: Record<string, string>;
      columnCount?: number;
      columnStart?: number;
      columnSpan?: number;
      children: ProjectedUnit[];
      sourceLocator: { kind: "xpath"; value: string };
      contentRole: ContentRole;
    };
const layouts: Record<
  string,
  Extract<ProjectedUnit, { type: "element" }>["name"]
> = {
  text: "group",
  fussnoten: "group",
  Content: "group",
  P: "paragraph",
  BR: "line-break",
  pre: "group",
  TOC: "group",
  Ident: "group",
  Title: "group",
  table: "table",
  tgroup: "group",
  colspec: "group",
  tbody: "group",
  row: "row",
  entry: "cell",
  DL: "list",
  DT: "list-marker",
  DD: "list-item",
  LA: "group",
  NB: "group",
  I: "emphasis",
  B: "emphasis",
  SP: "group",
  noindex: "group",
  kommentar: "group",
};
function tableGrid(table: ElementUnit): {
  width: number;
  cells: Map<string, [number, number]>;
} {
  const groups = children(table, "tgroup");
  if (groups.length !== 1) throw new Error("Table must contain one tgroup");
  const group = groups[0];
  for (const key of ["colsep", "rowsep"])
    if (
      group.attributes[key] !== undefined &&
      !["0", "1"].includes(group.attributes[key])
    )
      throw new Error(`Unsupported tgroup@${key}`);
  const number = (s: string | undefined): number => {
    if (!s || !/^[1-9][0-9]*$/u.test(s) || !Number.isSafeInteger(Number(s)))
      throw new Error("Invalid table column number");
    return Number(s);
  };
  const width = number(group.attributes.cols);
  const groupElements = group.children.filter(
    (node): node is ElementUnit => node.type === "element",
  );
  if (
    groupElements.at(-1)?.name !== "tbody" ||
    groupElements.slice(0, -1).some((node) => node.name !== "colspec")
  )
    throw new Error("Invalid tgroup child order");
  const specs = children(group, "colspec");
  const names = new Map<string, number>();
  const positions = new Set<number>();
  let previous = 0;
  for (const spec of specs) {
    const pos =
      spec.attributes.colnum === undefined
        ? previous + 1
        : number(spec.attributes.colnum);
    const name = spec.attributes.colname;
    if (
      !name ||
      names.has(name) ||
      positions.has(pos) ||
      pos <= previous ||
      pos > width
    )
      throw new Error("Invalid table colspec");
    names.set(name, pos);
    positions.add(pos);
    previous = pos;
  }
  const bodies = children(group, "tbody");
  if (bodies.length !== 1) throw new Error("Table must contain one tbody");
  const rows = children(bodies[0], "row");
  if (!rows.length) throw new Error("Table has no rows");
  const cells = new Map<string, [number, number]>();
  const lookup = (name: string) => {
    const pos = names.get(name);
    if (pos === undefined) throw new Error("Unknown table column name");
    return pos;
  };
  for (const row of rows) {
    let next = 1;
    for (const entry of children(row, "entry")) {
      const { colname, namest, nameend } = entry.attributes;
      if (
        (namest === undefined) !== (nameend === undefined) ||
        (colname !== undefined && namest !== undefined)
      )
        throw new Error("Invalid table span attributes");
      const start =
        namest !== undefined
          ? lookup(namest)
          : colname !== undefined
            ? lookup(colname)
            : next;
      const end = nameend !== undefined ? lookup(nameend) : start;
      if (start !== next || end < start || end > width)
        throw new Error("Invalid table row coverage");
      const span = end - start + 1;
      cells.set(entry.locator, [start, span]);
      next = end + 1;
    }
    if (next !== width + 1) throw new Error("Invalid table row coverage");
  }
  return { width, cells };
}
function projectUnit(unit: NationalXmlUnit, role: ContentRole): ProjectedUnit {
  const sourceLocator = { kind: "xpath" as const, value: unit.locator };
  if (unit.type === "text")
    return { type: "text", text: unit.text, sourceLocator, contentRole: role };
  const name = layouts[unit.name];
  if (!name) throw new Error(`Unsupported content element ${unit.name}`);
  const nextRole =
    unit.name === "fussnoten" ||
    unit.name === "noindex" ||
    unit.name === "kommentar"
      ? "source-note"
      : role;
  const grid = unit.name === "table" ? tableGrid(unit) : undefined;
  const projectedChildren = unit.children.map((child) =>
    projectUnit(child, nextRole),
  );
  if (grid) {
    const annotate = (node: ProjectedUnit) => {
      if (node.type === "element") {
        const cell = grid.cells.get(node.sourceLocator.value);
        if (cell) {
          node.columnStart = cell[0];
          node.columnSpan = cell[1];
        }
        node.children.forEach(annotate);
      }
    };
    projectedChildren.forEach(annotate);
  }
  return {
    type: "element",
    name,
    ...(grid ? { columnCount: grid.width } : {}),
    sourceName: unit.name,
    sourceAttributes: unit.attributes,
    sourceLocator,
    contentRole: nextRole,
    children: projectedChildren,
  };
}
function roleText(units: ProjectedUnit[], role: ContentRole): string {
  return contentUnitsText(units as ContentUnit[], role);
}

function normId(documentId: string, workId: string, sourceId: string): string {
  return `${documentId}:norm:${(sourceId.slice(workId.length) || "root").toLowerCase()}`;
}
export function parseNationalXml(
  bytes: Uint8Array,
  snapshot: NationalSourceSnapshot,
  source: NationalSourceDefinition,
) {
  const parsed = inspectNationalXml(bytes, snapshot, source);
  const sourceVersion = `gii-${snapshot.content.sha256.slice(7)}`;
  const documentId = source.documentId;
  const provisions: unknown[] = [];
  const structuralNodes: unknown[] = [];
  let count = 0;
  let sourceNoteCount = 0;
  let tocCount = 0;
  let tableCount = 0;
  const byId = new Map(parsed.norms.map((n) => [n.sourceId, n]));
  for (const norm of parsed.norms) {
    const id = normId(documentId, source.sourceWorkId, norm.sourceId);
    const common = {
      logicalId: id,
      sourceVersionId: `${id}@${sourceVersion}`,
      sourceSnapshotId: snapshot.snapshotId,
      displayOrder: count++,
      sourceLocator: { kind: "xpath", value: norm.locator },
      parserWarnings: [],
    };
    if (norm.group) {
      if (
        (norm.text && nationalUnitText(norm.text).trim()) ||
        (norm.footnotes && nationalUnitText(norm.footnotes).trim())
      )
        throw new Error("Structural group carries unsupported text or notes");
      const parent = norm.structuralPath.at(-2);
      structuralNodes.push({
        ...common,
        kind:
          norm.structuralPath.length === 1
            ? "chapter"
            : norm.structuralPath.length === 2
              ? "section"
              : "subsection",
        label: norm.group.label,
        title: norm.group.title,
        ...(parent
          ? { parentLogicalId: normId(documentId, source.sourceWorkId, parent) }
          : {}),
      });
      continue;
    }
    const data = children(parsed.root, "norm").find(
      (x) => x.attributes.doknr === norm.sourceId,
    );
    const textdata = data && child(data, "textdaten");
    if (!textdata) throw new Error("Missing text data");
    const role: ContentRole =
      norm.label === "Inhaltsübersicht"
        ? "toc"
        : norm.text
          ? "operative-text"
          : "source-note";
    if (role === "toc") tocCount++;
    const orderedUnits = textdata.children
      .filter((x): x is ElementUnit => x.type === "element")
      .map((x) => projectUnit(x, role));
    const notes = (unit: ProjectedUnit): number =>
      unit.type === "element"
        ? (unit.contentRole === "source-note" &&
          unit.sourceName !== "noindex" &&
          unit.sourceName !== "kommentar" &&
          unit.sourceName !== "fussnoten"
            ? 0
            : ["fussnoten", "noindex"].includes(unit.sourceName) &&
                roleText([unit], "source-note").length > 0
              ? 1
              : 0) + unit.children.reduce((a, b) => a + notes(b), 0)
        : 0;
    sourceNoteCount += orderedUnits.reduce((a, b) => a + notes(b), 0);
    const countTables = (unit: ProjectedUnit): number =>
      unit.type === "element"
        ? (unit.name === "table" ? 1 : 0) +
          unit.children.reduce((a, b) => a + countTables(b), 0)
        : 0;
    tableCount += orderedUnits.reduce((a, b) => a + countTables(b), 0);
    const text = roleText(orderedUnits, role);
    const structuralPath = norm.structuralPath.map((key) => {
      const group = byId.get(key)?.group;
      if (!group) throw new Error("Missing group");
      return {
        logicalId: normId(documentId, source.sourceWorkId, key),
        kind:
          group.code.length === 3
            ? "chapter"
            : group.code.length === 6
              ? "section"
              : "subsection",
        label: group.label,
      };
    });
    provisions.push({
      ...common,
      kind: norm.label?.startsWith("§")
        ? "article"
        : norm.label?.startsWith("Anlage") || norm.label?.startsWith("Anhang")
          ? "annex"
          : "other",
      label: norm.label ?? "Source notes",
      numberRaw: norm.label,
      numberNormalized: norm.label?.startsWith("§")
        ? norm.label.replace(/^§\s*/u, "").replace(/\s+/gu, "-").toLowerCase()
        : normId(documentId, source.sourceWorkId, norm.sourceId)
            .split(":")
            .at(-1),
      ...(norm.title ? { title: norm.title } : {}),
      text,
      contentHash: `sha256:${createHash("sha256").update(text).digest("hex")}`,
      contentRole: role,
      roleHashes: Object.fromEntries(
        (["operative-text", "source-note", "toc"] as const).map((r) => [
          r,
          `sha256:${createHash("sha256").update(roleText(orderedUnits, r)).digest("hex")}`,
        ]),
      ),
      orderedUnits,
      structuralPath,
    });
  }
  const authorityNote =
    "German federal government publication of a non-authoritative consolidated text.";
  const sourceNotes = parsed.stand.map((s) =>
    [s.type, s.text].filter(Boolean).join(": "),
  );
  const document = {
    schemaVersion: "1.4.0",
    logicalId: documentId,
    sourceVersionId: `${documentId}@${sourceVersion}`,
    sourceSnapshotId: snapshot.snapshotId,
    displayOrder: 0,
    sourceLocator: { kind: "xpath", value: parsed.root.locator },
    parserWarnings: [],
    jurisdiction: "DE",
    language: "de",
    documentType: "law",
    identifiers: { localId: source.localId, nationalId: source.sourceWorkId },
    familyIds: [source.familyId],
    shortName: source.shortName,
    officialTitle: source.officialTitle,
    publicationDate: source.publicationDate,
    source: {
      id: snapshot.snapshotId,
      provenance: "official",
      sourceSystem: "gii",
      retrievedAt: snapshot.retrievedAt,
      canonicalUrl: snapshot.canonicalUrl,
      contentUrl: snapshot.content.url,
      mediaType: "application/xml",
      sha256: snapshot.content.sha256,
      bytes: snapshot.content.bytes,
      sourceVersion,
      sourceStatus: {
        basis: "consolidated",
        textAsOf: source.lastAmendmentDate,
        textAsOfBasis: "last-amendment-act-date",
        textAuthorityStatus: "non-authoritative-consolidation",
        authorityNote,
        sourceNotes,
        currentVersionUrl: source.pageUrl,
        corrections: [],
      },
    },
    structuralNodes,
    provisions,
  };
  return {
    document,
    report: {
      normCount: parsed.norms.length,
      normIds: parsed.norms.map((n) => n.sourceId).sort(),
      metadataHashes: Object.fromEntries(
        parsed.norms.map(
          ({ sourceId, label, title, group, structuralPath }) => [
            sourceId,
            `sha256:${createHash("sha256").update(JSON.stringify({ label, title, group, structuralPath })).digest("hex")}`,
          ],
        ),
      ),
      structuralNodeCount: structuralNodes.length,
      provisionCount: provisions.filter(
        (x) => (x as { contentRole: string }).contentRole === "operative-text",
      ).length,
      sourceNoteCount,
      tocCount,
      blockCount: 0,
      tableCount,
      warningCount: 0,
    },
  };
}
