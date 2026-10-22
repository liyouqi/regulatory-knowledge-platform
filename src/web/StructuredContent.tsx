import { Fragment, type ReactNode } from "react";
import {
  type ContentLayout,
  type ContentRun,
  validateContentLayout,
} from "../shared/content-unit";
import type { BodyBlock } from "../shared/legal";

export function StructuredContent({
  block,
  language,
}: { block: BodyBlock; language?: "en" | "de" | "fr" }) {
  const runs = block.orderedContent;
  if (runs.some((run) => run.type !== "text"))
    throw new Error("Structured norm contains an unsupported run");
  validateContentLayout(runs as ContentRun[], block.contentLayout ?? []);
  function render(
    node: ContentLayout,
    key: string,
    parentRole?: string,
    parentListStyle?: "ordered" | "unordered",
  ): ReactNode {
    if (node.name === "run") {
      const run = runs[node.contentIndex ?? -1];
      if (run?.type !== "text")
        throw new Error("Missing structured content run");
      return (
        <span key={key} data-content-index={node.contentIndex}>
          {run.text}
        </span>
      );
    }
    const children = node.children.map((child, index) =>
      render(
        child,
        `${key}.${index}`,
        node.contentRole,
        node.name === "list" ? node.listStyle : undefined,
      ),
    );
    const sourceNote =
      node.contentRole === "source-note" && parentRole !== "source-note";
    const body =
      node.name === "table" ? (
        <table className="source-table">
          <tbody>{children}</tbody>
        </table>
      ) : node.name === "row" ? (
        <tr className="source-table-row">{children}</tr>
      ) : node.name === "cell" ? (
        <td className="source-table-cell" colSpan={node.columnSpan}>
          {children}
        </td>
      ) : node.name === "paragraph" ? (
        <div className="source-paragraph">{children}</div>
      ) : node.name === "list" ? (
        node.listStyle === "ordered" ? (
          <ol className="source-list">{children}</ol>
        ) : node.listStyle === "unordered" ? (
          <ul className="source-list">{children}</ul>
        ) : (
          <div className="source-list">{children}</div>
        )
      ) : node.name === "list-marker" ? (
        <div className="source-list-marker">{children}</div>
      ) : node.name === "list-item" ? (
        parentListStyle ? (
          <li className="source-list-item">{children}</li>
        ) : (
          <div className="source-list-item">{children}</div>
        )
      ) : node.name === "emphasis" ? (
        <em>{children}</em>
      ) : node.name === "superscript" ? (
        <sup>{children}</sup>
      ) : node.name === "link" ? (
        <a href={node.href} rel="noreferrer" target="_blank">
          {children}
        </a>
      ) : (
        children
      );
    return sourceNote ? (
      <aside
        key={key}
        className="publisher-note"
        data-copilot-ignore-selection="true"
      >
        <strong>Publisher note</strong>
        {body}
      </aside>
    ) : (
      <Fragment key={key}>{body}</Fragment>
    );
  }
  return (
    <div className="structured-legal-content" lang={language}>
      {block.contentRole === "toc" ? (
        <p className="source-content-label">Source table of contents</p>
      ) : null}
      {block.contentLayout?.map((node, index) => render(node, String(index)))}
    </div>
  );
}
