import { expect, test } from "@playwright/test";

const GRAPH_READY_BUDGET_MS = 8_000;

function scaleOverview(size: number) {
  const works = Array.from({ length: size }, (_, index) => {
    const celex = `32001R${String(index + 1).padStart(4, "0")}`;
    const id = `earth:work:${celex}`;
    return {
      id,
      membership: "included",
      entityKind: "document",
      workId: id,
      label: `Scale Work ${String(index + 1).padStart(3, "0")}`,
      measureType: "primary-act",
      officialIdentity: {
        celex,
        workUri: `https://publications.europa.eu/resource/cellar/scale-${index}`,
        expressionUri: `https://publications.europa.eu/resource/cellar/scale-${index}-eng`,
      },
    };
  });
  const aggregates = works.slice(1).map((work, index) => ({
    id: `earth-aggregate:scale-${index}`,
    source: works[index].id,
    target: work.id,
    relationTypes: ["AMENDS"],
    provenances: ["CELLAR_METADATA"],
    relationshipIds: [`relationship:scale-${index}`],
    count: 1,
  }));
  return {
    universe: {
      id: `earth-scale-${size}`,
      version: "test-only",
      displayName: `Earth Scale ${size}`,
    },
    build: {
      buildId: `earth-scale-build-${size}`,
      builtAt: "2026-09-10T00:00:00.000Z",
      sourceSnapshotIds: ["test-only-snapshot"],
    },
    works,
    relationshipCount: aggregates.length,
    aggregates,
    boundary: {
      nodes: [],
      nodeCount: 0,
      matchCount: 0,
      returnedCount: 0,
      relationshipCount: 0,
      visibleRelationshipCount: 0,
      limit: 100,
      offset: 0,
      hasMore: false,
    },
  };
}

function boundaryOverview(requestUrl: string) {
  const url = new URL(requestUrl);
  const limit = Number(url.searchParams.get("boundaryLimit") ?? "100");
  const offset = Number(url.searchParams.get("boundaryOffset") ?? "0");
  const query = (url.searchParams.get("boundaryQuery") ?? "").toUpperCase();
  const root = scaleOverview(1);
  const allBoundaryNodes = Array.from({ length: 205 }, (_, index) => {
    const celex = `32000R${String(index + 1).padStart(4, "0")}`;
    return {
      id: `earth:work:${celex}`,
      membership: "boundary",
      entityKind: "external-work",
      label: `CELEX ${celex}`,
      sourceUrl: `https://publications.europa.eu/resource/cellar/boundary-${index}`,
      officialIdentity: {
        celex,
        workUri: `https://publications.europa.eu/resource/cellar/boundary-${index}`,
      },
    };
  });
  const matches = allBoundaryNodes.filter((node) =>
    node.officialIdentity.celex.includes(query),
  );
  const nodes = matches.slice(offset, offset + limit);
  const aggregates = nodes.map((node, index) => ({
    id: `earth-aggregate:boundary-${offset + index}`,
    source: root.works[0].id,
    target: node.id,
    relationTypes: ["AMENDS"],
    provenances: ["CELLAR_METADATA"],
    relationshipIds: [`relationship:boundary-${offset + index}`],
    count: 1,
  }));
  return {
    ...root,
    relationshipCount: allBoundaryNodes.length,
    aggregates,
    boundary: {
      nodes,
      nodeCount: allBoundaryNodes.length,
      matchCount: matches.length,
      returnedCount: nodes.length,
      relationshipCount: allBoundaryNodes.length,
      visibleRelationshipCount: aggregates.length,
      limit,
      offset,
      hasMore: offset + nodes.length < matches.length,
    },
  };
}

for (const size of [100, 200, 400]) {
  test(`Earth graph reaches a browser frame with ${size} test-only Works`, async ({
    page,
  }, testInfo) => {
    const overview = scaleOverview(size);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("**/api/earth/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/earth/universes") {
        await route.fulfill({
          json: { universes: [overview.universe] },
        });
      } else if (url.pathname.endsWith("/overview")) {
        await route.fulfill({ json: overview });
      } else {
        await route.abort();
      }
    });

    const startedAt = Date.now();
    await page.goto("/earth");
    const stage = page.locator(".earth-graph-stage");
    await expect(stage).toHaveAttribute("data-earth-node-count", String(size));
    await expect(stage.locator("canvas")).toBeVisible({ timeout: 10_000 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const graphReadyMs = Date.now() - startedAt;
    await testInfo.attach(`earth-${size}-graph-ready.json`, {
      body: JSON.stringify({ size, graphReadyMs }),
      contentType: "application/json",
    });
    expect(pageErrors).toEqual([]);
    expect(graphReadyMs).toBeLessThan(GRAPH_READY_BUDGET_MS);
  });
}

test("Earth pages and filters a test-only 205-Work boundary", async ({
  page,
}) => {
  const universe = scaleOverview(1).universe;
  await page.route("**/api/earth/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/earth/universes") {
      await route.fulfill({ json: { universes: [universe] } });
    } else if (url.pathname.endsWith("/overview")) {
      await route.fulfill({ json: boundaryOverview(url.toString()) });
    } else {
      await route.abort();
    }
  });

  await page.goto("/earth");
  await page.locator(".earth-boundary-disclosure summary").click();
  await expect(page.getByText("1–100 of 205", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByText("101–200 of 205", { exact: false }),
  ).toBeVisible();

  const filter = page.getByRole("searchbox", {
    name: "Find boundary Work by CELEX or official title",
  });
  await filter.fill("32000R0205");
  await page.getByRole("button", { name: "Find" }).click();
  await expect(
    page.getByText("1–1 of 1 matches (205 total)", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Structured" }).click();
  await expect(
    page.getByRole("button", { name: "CELEX 32000R0205" }),
  ).toBeVisible();
});

test("Earth enters and exits an explicitly bounded exact neighbourhood", async ({
  page,
}) => {
  const overview = scaleOverview(1);
  const root = overview.works[0];
  const boundary = {
    id: "earth:work:32002R0001",
    membership: "boundary",
    entityKind: "external-work",
    label: "CELEX 32002R0001",
    sourceUrl: "https://publications.europa.eu/resource/cellar/exact-boundary",
    officialIdentity: {
      celex: "32002R0001",
      workUri: "https://publications.europa.eu/resource/cellar/exact-boundary",
    },
  };
  const relationship = {
    projection: "exact",
    id: "relationship:exact-test",
    source: root.id,
    target: boundary.id,
    relationType: "AMENDS",
    provenance: "CELLAR_METADATA",
    evidence: {
      text: "http://publications.europa.eu/ontology/cdm#resource_legal_amends_resource_legal",
      locator: "test-only exact locator",
      sourceUrl: root.officialIdentity.workUri,
    },
  };
  await page.route("**/api/earth/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/earth/universes") {
      await route.fulfill({ json: { universes: [overview.universe] } });
    } else if (url.pathname.endsWith("/overview")) {
      await route.fulfill({ json: overview });
    } else if (url.pathname.endsWith("/children")) {
      await route.fulfill({ json: { children: [], limit: 100 } });
    } else if (url.pathname.endsWith("/neighbourhood")) {
      await route.fulfill({
        json: {
          root,
          nodes: [root, boundary],
          relationships: [relationship],
          options: {
            depth: 1,
            nodeLimit: 100,
            edgeLimit: 150,
            direction: "both",
          },
        },
      });
    } else if (url.pathname.includes("/relationships/")) {
      await route.fulfill({ json: { relationship } });
    } else {
      await route.abort();
    }
  });

  await page.goto("/earth");
  await page.getByRole("button", { name: "Structured" }).click();
  await page.getByRole("button", { name: /Scale Work 001/ }).click();
  await page
    .getByRole("button", { name: "Show exact loaded neighbourhood" })
    .click();
  const stage = page.locator(".earth-graph-stage");
  await expect(stage).toHaveAttribute("data-earth-relation-mode", "exact");
  await expect(stage).toHaveAttribute("data-earth-node-count", "2");
  await expect(page.getByText("2 nodes · 1 exact relations")).toBeVisible();
  await page.getByRole("button", { name: /AMENDS.*32002R0001/ }).click();
  await expect(page.getByText("Official predicate")).toBeVisible();

  await page
    .getByRole("button", { name: "Return to aggregate overview" })
    .click();
  await expect(stage).toHaveAttribute("data-earth-relation-mode", "aggregate");
  await expect(stage).toHaveAttribute("data-earth-node-count", "1");
});
