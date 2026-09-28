import sharp from "sharp";
import type { FormexResourceDocument } from "./formex-package";

export interface PreparedFormexResourceDocument {
  fileName: string;
  sourceMediaType: "image/tiff";
  sourceBytes: Uint8Array;
  mediaType: "image/png";
  renditionBytes: Uint8Array;
}

const MAX_FORMULA_PIXELS = 40_000_000;

export async function prepareFormexResources(
  resources: FormexResourceDocument[],
): Promise<PreparedFormexResourceDocument[]> {
  const prepared: PreparedFormexResourceDocument[] = [];
  for (const resource of resources) {
    const image = sharp(resource.bytes, {
      failOn: "warning",
      limitInputPixels: MAX_FORMULA_PIXELS,
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== "tiff" ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new Error(
        `Unsupported Formex formula resource: ${resource.fileName}`,
      );
    }
    const renditionBytes = await image
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    prepared.push({
      fileName: resource.fileName,
      sourceMediaType: resource.mediaType,
      sourceBytes: resource.bytes,
      mediaType: "image/png",
      renditionBytes,
    });
  }
  return prepared;
}
