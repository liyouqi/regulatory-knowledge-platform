import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";

// Source inspection only. This format is not Canonical data or a runtime input.
export const AMF_CANDIDATE_PARSER_VERSION = "1.0.0";
const origin = "https://www.amf-france.org";
const prefix = "/fr/eli/fr/aai/amf/rg";
function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
type RawNode = Record<string, unknown>;
type Role = "structure" | "operative-text" | "source-note";
export type AmfCandidateContent =
  | { type: "text"; text: string }
  | {
      type: "element";
      tag: string;
      attributes: Record<string, string>;
      role: Role;
      locator: string;
      children: AmfCandidateContent[];
    };
type NoteReference = { index: number; textSha256: string };
export interface AmfCandidateBaseline {
  schemaVersion: "1.0";
  input: { sha256: string; bytes: number };
  source: { canonicalUrl: string; versionDate: string; title: string };
  groups: {
    sourceUrl: string;
    parentSourceUrl: string | null;
    label: string;
    notes: NoteReference[];
  }[];
  articles: {
    label: string;
    rawHref: string;
    sourceUrl: string;
    groupSourceUrl: string;
    contentSha256: string;
    notes: NoteReference[];
  }[];
  notes: {
    scope: "document" | "group" | "article";
    ownerSourceUrl: string;
    position: number;
    textSha256: string;
  }[];
}

function tag(node: RawNode): string {
  return Object.keys(node).find((key) => key !== ":@") ?? "";
}
function children(node: RawNode): RawNode[] {
  const value = node[tag(node)];
  return Array.isArray(value) ? value : [];
}
function elements(node: RawNode): RawNode[] {
  return children(node).filter((item) => tag(item) !== "#text");
}
function attrs(node: RawNode): Record<string, string> {
  return (node[":@"] ?? {}) as Record<string, string>;
}
function hasClass(node: RawNode, value: string): boolean {
  return (attrs(node).class ?? "").split(/\s/u).includes(value);
}
function one(nodes: RawNode[], description: string): RawNode {
  if (nodes.length !== 1)
    throw new Error(`${description}: expected one, received ${nodes.length}`);
  return nodes[0];
}
function all(
  nodes: RawNode[],
  predicate: (node: RawNode) => boolean,
): RawNode[] {
  return nodes.flatMap((node) => [
    ...(predicate(node) ? [node] : []),
    ...all(children(node), predicate),
  ]);
}
function decode(value: string): string {
  // Decode once: literal "&amp;nbsp;" must remain "&nbsp;".
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: "\u00a0",
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/giu,
    (entity, key: string) => {
      if (!key.startsWith("#")) {
        if (!(key in named))
          throw new Error(`Unsupported AMF entity: ${entity}`);
        return named[key];
      }
      const code =
        key.startsWith("#x") || key.startsWith("#X")
          ? Number.parseInt(key.slice(2), 16)
          : Number.parseInt(key.slice(1), 10);
      if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
        throw new Error(`Invalid AMF character reference: ${entity}`);
      return String.fromCodePoint(code);
    },
  );
}
function text(node: RawNode): string {
  return tag(node) === "#text"
    ? decode(String(node["#text"]))
    : children(node).map(text).join("");
}
function attributes(node: RawNode, allowed: string[], required: string[] = []) {
  for (const key of Object.keys(attrs(node)))
    if (!allowed.includes(key))
      throw new Error(`Unknown AMF ${tag(node)} attribute: ${key}`);
  for (const key of required)
    if (!attrs(node)[key])
      throw new Error(`Missing AMF ${tag(node)} attribute: ${key}`);
}
function classes(node: RawNode, allowed: string[]) {
  for (const value of (attrs(node).class ?? "").split(/\s/u).filter(Boolean))
    if (!allowed.includes(value))
      throw new Error(`Unknown AMF class: ${value}`);
}
function officialUrl(value: string): string {
  const url = new URL(decode(value), origin);
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.port ||
    /https:\/\/[^/]*:\d+/iu.test(value) ||
    url.search ||
    url.hash
  )
    throw new Error(`Unexpected AMF identity URL: ${value}`);
  return url.href;
}
function heading(node: RawNode): boolean {
  return (
    /^h[2-6]$/u.test(tag(node)) ||
    hasClass(node, "like-h7") ||
    hasClass(node, "like-h8")
  );
}
function whitespaceOnly(nodes: RawNode[]) {
  if (nodes.some((node) => tag(node) === "#text" && text(node).trim()))
    throw new Error(
      "Unexpected AMF text outside a heading, body, or source note",
    );
}
function validateBody(node: RawNode): void {
  for (const child of children(node)) {
    if (tag(child) === "#text") continue;
    const allowed: Record<string, string[]> = {
      p: [],
      span: ["data-type"],
      li: [],
      ol: [],
      ul: [],
      i: ["lang"],
      sup: [],
      a: ["href", "target"],
    };
    if (!allowed[tag(child)])
      throw new Error(`Unsupported AMF body element: ${tag(child)}`);
    attributes(child, allowed[tag(child)]);
    validateBody(child);
  }
}
function markup(
  node: RawNode,
  role: Role,
  locator: string,
): AmfCandidateContent {
  if (tag(node) === "#text") return { type: "text", text: text(node) };
  const name = tag(node);
  if (
    ![
      "div",
      "p",
      "span",
      "li",
      "ol",
      "ul",
      "i",
      "sup",
      "a",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "h1",
    ].includes(name)
  )
    throw new Error(`Unsupported AMF legal element: ${name}`);
  const allowed =
    name === "a"
      ? ["href", "target", "class"]
      : name === "div"
        ? ["class", "data-eli-content"]
        : name === "span"
          ? ["class", "data-type"]
          : name === "h1"
            ? ["class", "about", "property", "typeof"]
            : name === "i"
              ? ["lang"]
              : [];
  attributes(node, allowed);
  if (name === "a") {
    attributes(node, allowed, ["href"]);
    const href = new URL(decode(attrs(node).href), origin);
    if (
      !["http:", "https:"].includes(href.protocol) ||
      href.username ||
      href.password
    )
      throw new Error("Unsupported AMF content link");
    if (attrs(node).target && attrs(node).target !== "_blank")
      throw new Error("Unknown AMF link target");
    classes(node, ["js-eli-nav"]);
  }
  if (name === "span") {
    classes(node, ["title-type", "title-label"]);
    if (attrs(node)["data-type"] && attrs(node)["data-type"] !== "noteRefleg")
      throw new Error("Unknown AMF inline annotation");
  }
  if (name === "i" && attrs(node).lang && attrs(node).lang !== "la")
    throw new Error("Unknown AMF inline language");
  if (name === "h1") classes(node, ["rg-title", "ta-c"]);
  if (name === "div")
    classes(node, [
      "rg-content",
      "active-part",
      "rg-part",
      "art",
      "art-titre",
      "art-content",
      "like-h7",
      "like-h8",
      "note-amf",
      "bk-info",
      "kevin",
      "-always-visible",
      "bg-lightgrey",
      "bk-padding",
      "shadow",
    ]);
  const nodeRole = hasClass(node, "note-amf")
    ? "source-note"
    : hasClass(node, "art-content")
      ? "operative-text"
      : heading(node) || hasClass(node, "art-titre")
        ? "structure"
        : role;
  let elementIndex = 0;
  let textIndex = 0;
  return {
    type: "element",
    tag: name,
    role: nodeRole,
    locator,
    attributes: Object.fromEntries(
      Object.entries(attrs(node)).map(([key, value]) => [key, decode(value)]),
    ),
    children: children(node).map((child) =>
      markup(
        child,
        nodeRole,
        tag(child) === "#text"
          ? `${locator}/text()[${++textIndex}]`
          : `${locator}/*[${++elementIndex}]`,
      ),
    ),
  };
}

export function inspectAmfCandidate(input: Uint8Array | string) {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (!bytes.length || bytes.length > 8_000_000)
    throw new Error("Invalid AMF candidate byte count");
  const html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!ENTITY|<!DOCTYPE(?!\s+html\s*>)/iu.test(html))
    throw new Error("Unsupported AMF declaration");
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    parseAttributeValue: false,
    parseTagValue: false,
    processEntities: false,
    trimValues: false,
    unpairedTags: [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "source",
      "track",
      "wbr",
    ],
    stopNodes: ["*.script", "*.style"],
  }).parse(html) as RawNode[];
  const canonicalNode = one(
    all(parsed, (n) => tag(n) === "link" && attrs(n).rel === "canonical"),
    "AMF canonical link",
  );
  const canonicalUrl = officialUrl(attrs(canonicalNode).href ?? "");
  const dateToken = new RegExp(`^${origin}${prefix}/(\\d{8})/notes$`, "u").exec(
    canonicalUrl,
  )?.[1];
  if (!dateToken) throw new Error("Unexpected AMF canonical version URL");
  const versionDate = `${dateToken.slice(0, 4)}-${dateToken.slice(4, 6)}-${dateToken.slice(6)}`;
  if (
    !Number.isFinite(Date.parse(versionDate)) ||
    new Date(versionDate).toISOString().slice(0, 10) !== versionDate
  )
    throw new Error("Invalid AMF source version date");
  const titleNode = one(
    all(parsed, (n) => tag(n) === "h1" && hasClass(n, "rg-title")),
    "AMF version title",
  );
  const title = text(titleNode);
  if (
    attrs(titleNode).about !== `/eli/fr/aai/amf/rg/${dateToken}` ||
    !new RegExp(
      `^\\s*Règlement général de l'AMF en vigueur au ${dateToken.slice(6)}/${dateToken.slice(4, 6)}/${dateToken.slice(0, 4)}\\s*$`,
      "u",
    ).test(title)
  )
    throw new Error(
      "AMF title, expression identity, and version date disagree",
    );
  const root = one(
    all(parsed, (n) => hasClass(n, "rg-content")),
    "AMF legal content",
  );
  attributes(root, ["class"], ["class"]);
  const parent = one(
    all(parsed, (n) => elements(n).includes(root)),
    "AMF content parent",
  );
  if (
    !hasClass(parent, "content-with-padding-r") ||
    !elements(parent).includes(titleNode)
  )
    throw new Error("Unexpected AMF version/container boundary");
  const baseline: AmfCandidateBaseline = {
    schemaVersion: "1.0",
    input: { sha256: sha256(bytes), bytes: bytes.length },
    source: { canonicalUrl, versionDate, title },
    groups: [],
    articles: [],
    notes: [],
  };
  const seenGroups = new Set<string>();
  const seenArticles = new Set<string>();
  const seenLabels = new Set<string>();
  const note = (
    node: RawNode,
    scope: "document" | "group" | "article",
    ownerSourceUrl: string,
    position: number,
    refs?: NoteReference[],
  ) => {
    attributes(node, ["class"], ["class"]);
    whitespaceOnly(children(node));
    const wrapper = one(elements(node), "AMF source note wrapper");
    if (
      tag(wrapper) !== "div" ||
      attrs(wrapper).class !== "bg-lightgrey bk-padding shadow"
    )
      throw new Error("Unknown AMF source note shape");
    attributes(wrapper, ["class"], ["class"]);
    validateBody(wrapper);
    const textSha256 = sha256(text(node));
    refs?.push({ index: baseline.notes.length, textSha256 });
    baseline.notes.push({ scope, ownerSourceUrl, position, textSha256 });
  };
  const parseArticle = (node: RawNode, groupSourceUrl: string) => {
    attributes(node, ["class"], ["class"]);
    whitespaceOnly(children(node));
    const parts = elements(node);
    const titleNode = one(
      parts.filter((n) => hasClass(n, "art-titre")),
      "AMF article title",
    );
    const body = one(
      parts.filter((n) => hasClass(n, "art-content")),
      "AMF article body",
    );
    if (
      parts[0] !== titleNode ||
      parts.at(-1) !== body ||
      parts.some(
        (n) => n !== titleNode && n !== body && !hasClass(n, "note-amf"),
      )
    )
      throw new Error("Unexpected AMF article order or child");
    attributes(titleNode, ["class"], ["class"]);
    attributes(body, ["class"], ["class"]);
    validateBody(body);
    const anchor = one(elements(titleNode), "AMF article anchor");
    attributes(anchor, ["href"], ["href"]);
    if (tag(anchor) !== "a" || elements(anchor).length)
      throw new Error("Unexpected AMF article label markup");
    const label = text(titleNode);
    const comparisonLabel = label.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (
      !/^Article \d{3}(?:-(?:\d+|A))+(?: (?:bis|ter|quater))?$/u.test(
        comparisonLabel,
      )
    )
      throw new Error(`Unexpected AMF complete article label: ${label}`);
    const sourceUrl = officialUrl(attrs(anchor).href ?? "");
    if (
      !new RegExp(
        `^${origin}${prefix}/article/\\d{3}(?:-(?:\\d+|[Aa]))+(?:-(?:bis|ter|quater))?/\\d{8}/notes(?:-0)?$`,
        "u",
      ).test(sourceUrl)
    )
      throw new Error("Unexpected AMF article source URL");
    if (seenArticles.has(sourceUrl) || seenLabels.has(comparisonLabel))
      throw new Error("Duplicate AMF article URL or complete label");
    seenArticles.add(sourceUrl);
    seenLabels.add(comparisonLabel);
    const article = {
      label,
      rawHref: attrs(anchor).href,
      sourceUrl,
      groupSourceUrl,
      contentSha256: sha256(text(body)),
      notes: [] as NoteReference[],
    };
    baseline.articles.push(article);
    parts.forEach((part, index) => {
      if (hasClass(part, "note-amf"))
        note(part, "article", sourceUrl, index, article.notes);
    });
  };
  const parseGroup = (node: RawNode, parentSourceUrl: string | null) => {
    attributes(
      node,
      ["class", "data-eli-content"],
      ["class", "data-eli-content"],
    );
    whitespaceOnly(children(node));
    const sourceUrl = officialUrl(attrs(node)["data-eli-content"]);
    if (
      !new RegExp(
        `^${origin}${prefix}/livre/[1-7](?:/(?:titre|chapitre|section|sous-section|paragraphe|sous-paragraphe)/[0-9_]+)*/notes$`,
        "u",
      ).test(sourceUrl) ||
      seenGroups.has(sourceUrl)
    )
      throw new Error("Invalid or duplicate AMF group URL");
    if (
      parentSourceUrl &&
      !sourceUrl.startsWith(`${parentSourceUrl.slice(0, -6)}/`)
    )
      throw new Error("AMF group URL disagrees with source hierarchy");
    seenGroups.add(sourceUrl);
    const parts = elements(node);
    const titleNode = one(parts.filter(heading), "AMF group heading");
    attributes(titleNode, tag(titleNode) === "div" ? ["class"] : []);
    const anchor = one(elements(titleNode), "AMF group heading anchor");
    attributes(anchor, ["class", "href"], ["class", "href"]);
    if (attrs(anchor).class !== "js-eli-nav")
      throw new Error("Unknown AMF heading anchor class");
    const labels = elements(anchor);
    if (
      labels.length !== 2 ||
      labels.some((n) => tag(n) !== "span" || elements(n).length) ||
      attrs(labels[0]).class !== "title-type" ||
      attrs(labels[1]).class !== "title-label"
    )
      throw new Error("Unknown AMF heading labels");
    for (const label of labels) attributes(label, ["class"], ["class"]);
    if (
      parts[0] !== titleNode ||
      tag(anchor) !== "a" ||
      officialUrl(attrs(anchor).href ?? "") !== sourceUrl
    )
      throw new Error("AMF group heading disagrees with source identity");
    const group = {
      sourceUrl,
      parentSourceUrl,
      label: text(titleNode),
      notes: [] as NoteReference[],
    };
    baseline.groups.push(group);
    parts.slice(1).forEach((part, index) => {
      if (hasClass(part, "rg-part")) parseGroup(part, sourceUrl);
      else if (hasClass(part, "art")) parseArticle(part, sourceUrl);
      else if (hasClass(part, "note-amf"))
        note(part, "group", sourceUrl, index + 1, group.notes);
      else throw new Error(`Unknown AMF group child: ${tag(part)}`);
    });
  };
  const introNotes = elements(parent).filter((n) => hasClass(n, "note-amf"));
  for (const n of introNotes)
    note(n, "document", canonicalUrl, elements(parent).indexOf(n));
  whitespaceOnly(children(root));
  for (const group of elements(root)) {
    if (!hasClass(group, "rg-part"))
      throw new Error("AMF legal root must contain groups only");
    parseGroup(group, null);
  }
  if (!baseline.groups.length || !baseline.articles.length)
    throw new Error("Empty AMF candidate");
  const selectedNotes =
    introNotes.length +
    baseline.groups.reduce((sum, n) => sum + n.notes.length, 0) +
    baseline.articles.reduce((sum, n) => sum + n.notes.length, 0);
  if (all(parsed, (n) => hasClass(n, "note-amf")).length !== selectedNotes)
    throw new Error("AMF source note outside the reviewed boundary");
  if (
    all(parsed, (n) => hasClass(n, "art")).length !==
      baseline.articles.length ||
    all(parsed, (n) => hasClass(n, "rg-part")).length !== baseline.groups.length
  )
    throw new Error("AMF legal unit outside the reviewed boundary");
  const container =
    "//div[contains(concat(' ',normalize-space(@class),' '),' content-with-padding-r ')]";
  const legalContentAst = elements(parent).flatMap((node, index) =>
    node === root || node === titleNode || introNotes.includes(node)
      ? [
          markup(
            node,
            node === root || node === titleNode ? "structure" : "source-note",
            `${container}/*[${index + 1}]`,
          ),
        ]
      : [],
  );
  const roleTexts: Record<Role, string[]> = {
    structure: [],
    "operative-text": [],
    "source-note": [],
  };
  const collect = (node: AmfCandidateContent, role: Role) => {
    if (node.type === "text") roleTexts[role].push(node.text);
    else for (const child of node.children) collect(child, node.role);
  };
  for (const node of legalContentAst) collect(node, "structure");
  return {
    status: "candidate" as const,
    parserVersion: AMF_CANDIDATE_PARSER_VERSION,
    baseline,
    legalContentAst,
    legalContentAstHash: sha256(JSON.stringify(legalContentAst)),
    roleTextHashes: Object.fromEntries(
      Object.entries(roleTexts).map(([role, texts]) => [
        role,
        sha256(texts.join("")),
      ]),
    ),
  };
}
