import type {
  BodyBlock,
  DocumentView,
  ProvisionView,
} from "../../shared/legal";
import type { ReadingContextRef } from "../contract/copilot-contract";

const MAX_CONTEXT_CHARACTERS = 80_000;

export class CopilotContextNotFoundError extends Error {}
export class CopilotContextMismatchError extends Error {}

export interface CopilotContextRepository {
  readonly buildId: string;
  readonly profileId: string;
  readonly profileHash: string;
  findDocument(documentId: string): DocumentView | null;
}

export type ResolvedCopilotEvidence = {
  entityId: string;
  textRun: number;
  label: string;
  text: string;
  path: string;
  sourceUrl: string;
  sourceLocator: BodyBlock["sourceLocator"];
};

export type ResolvedCopilotContext = {
  runtime: {
    buildId: string;
    profileId: string;
    profileHash: string;
  };
  document: {
    id: string;
    shortName: string;
    officialTitle: string;
    sourceUrl: string;
    sourceSnapshotId: string;
    sourceVersion: string;
    asOf: string;
  };
  provision: {
    id: string;
    label: string;
    title?: string;
    path: string;
  };
  target: {
    entityId: string;
    label: string;
  };
  selection?: {
    text: string;
    textRun: number;
    start: number;
    end: number;
  };
  evidence: ResolvedCopilotEvidence[];
};

function findBlock(blocks: BodyBlock[], entityId: string): BodyBlock | null {
  for (const block of blocks) {
    if (block.id === entityId) return block;
    const nested = findBlock(block.children, entityId);
    if (nested) return nested;
  }
  return null;
}

function textRuns(block: BodyBlock): string[] {
  const runs = block.orderedContent.flatMap((item) =>
    item.type === "text" ? [item.text] : [],
  );
  return runs.length > 0 ? runs : block.text.trim() ? [block.text] : [];
}

function evidenceForBlock(
  block: BodyBlock,
  provision: ProvisionView,
  sourceUrl: string,
): ResolvedCopilotEvidence[] {
  const children = new Map(block.children.map((child) => [child.id, child]));
  const evidence: ResolvedCopilotEvidence[] = [];
  let runIndex = 0;
  for (const item of block.orderedContent) {
    if (item.type === "text") {
      evidence.push({
        entityId: block.id,
        textRun: runIndex++,
        label: block.marker ?? block.kind,
        text: item.text,
        path: `${provision.path}#${block.anchor}`,
        sourceUrl,
        sourceLocator: block.sourceLocator,
      });
      continue;
    }
    const child = children.get(item.childId);
    if (!child) {
      throw new CopilotContextMismatchError(
        `Body Block ${block.id} has incomplete ordered content`,
      );
    }
    evidence.push(...evidenceForBlock(child, provision, sourceUrl));
  }
  if (block.orderedContent.length === 0 && block.text.trim()) {
    evidence.push({
      entityId: block.id,
      textRun: 0,
      label: block.marker ?? block.kind,
      text: block.text,
      path: `${provision.path}#${block.anchor}`,
      sourceUrl,
      sourceLocator: block.sourceLocator,
    });
  }
  return evidence;
}

function boundedEvidence(evidence: ResolvedCopilotEvidence[]) {
  const characters = evidence.reduce((sum, item) => sum + item.text.length, 0);
  if (characters > MAX_CONTEXT_CHARACTERS) {
    throw new CopilotContextMismatchError(
      "The exact current context exceeds the bounded Copilot context window",
    );
  }
  return evidence;
}

export class CopilotContextResolver {
  constructor(private readonly repository: CopilotContextRepository) {}

  resolve(reference: ReadingContextRef): ResolvedCopilotContext {
    const document = this.repository.findDocument(reference.documentId);
    if (!document) {
      throw new CopilotContextNotFoundError("Reading document was not found");
    }
    const provision = document.provisions.find(
      (candidate) => candidate.id === reference.provisionId,
    );
    if (!provision) {
      throw new CopilotContextNotFoundError("Reading provision was not found");
    }

    const block = reference.entityId
      ? findBlock(provision.blocks, reference.entityId)
      : null;
    if (reference.entityId && !block) {
      throw new CopilotContextMismatchError(
        "Reading entity does not belong to the submitted provision",
      );
    }

    if (reference.selection) {
      if (!block || reference.selection.entityId !== block.id) {
        throw new CopilotContextMismatchError(
          "Selection does not belong to the resolved reading entity",
        );
      }
      const run = textRuns(block)[reference.selection.textRun];
      if (
        run === undefined ||
        reference.selection.end > run.length ||
        run.slice(reference.selection.start, reference.selection.end) !==
          reference.selection.text
      ) {
        throw new CopilotContextMismatchError(
          "Selection text does not match the official Runtime text",
        );
      }
    }

    const evidence = boundedEvidence(
      block
        ? evidenceForBlock(block, provision, document.sourceUrl)
        : provision.blocks.flatMap((item) =>
            evidenceForBlock(item, provision, document.sourceUrl),
          ),
    );
    if (evidence.length === 0) {
      throw new CopilotContextNotFoundError(
        "Reading context contains no official text",
      );
    }

    return {
      runtime: {
        buildId: this.repository.buildId,
        profileId: this.repository.profileId,
        profileHash: this.repository.profileHash,
      },
      document: {
        id: document.id,
        shortName: document.shortName,
        officialTitle: document.officialTitle,
        sourceUrl: document.sourceUrl,
        sourceSnapshotId: document.sourceSnapshotId,
        sourceVersion: document.sourceVersion,
        asOf: document.asOf,
      },
      provision: {
        id: provision.id,
        label: provision.label,
        title: provision.title,
        path: provision.path,
      },
      target: {
        entityId: block?.id ?? provision.id,
        label: block?.marker ?? block?.kind ?? provision.label,
      },
      selection: reference.selection
        ? {
            text: reference.selection.text,
            textRun: reference.selection.textRun,
            start: reference.selection.start,
            end: reference.selection.end,
          }
        : undefined,
      evidence,
    };
  }
}
