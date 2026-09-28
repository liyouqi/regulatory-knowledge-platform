import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareFormexResources } from "./formex-resources";

describe("Formex resource preparation", () => {
  it("creates a browser-readable lossless rendition of an official TIFF", async () => {
    const sourceBytes = await sharp({
      create: {
        width: 8,
        height: 4,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .tiff({ compression: "lzw" })
      .toBuffer();

    const [resource] = await prepareFormexResources([
      {
        fileName: "TEST.0001.tif",
        mediaType: "image/tiff",
        bytes: sourceBytes,
      },
    ]);

    expect(resource).toMatchObject({
      fileName: "TEST.0001.tif",
      sourceMediaType: "image/tiff",
      mediaType: "image/png",
    });
    expect((await sharp(resource?.renditionBytes).metadata()).format).toBe(
      "png",
    );
  });
});
