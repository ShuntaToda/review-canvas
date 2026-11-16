import { Copy, Download } from "lucide-react";
import { useState } from "react";
import type { MarkdownFormat } from "../model/markdown";
import type { StatusFilter } from "../model/threads";
import { Modal } from "./Modal";

type Scope = {
  status: StatusFilter;
  allPages: boolean;
  /** issue=Issue・PR に貼るチェックリスト、ai=AI に渡す詳しい形 */
  format: MarkdownFormat;
};

/**
 * コメントを Markdown で書き出す（GitHub の Issue にそのまま貼れる形と、AI に渡して直してもらう詳しい形）
 */
export const MarkdownDialog = ({
  initialScope,
  buildText,
  fileName,
  onCopied,
  onClose,
}: {
  initialScope: Scope;
  buildText: (scope: Scope) => string;
  fileName: (scope: Scope) => string;
  onCopied: () => void;
  onClose: () => void;
}) => {
  const [scope, setScope] = useState(initialScope);
  const text = buildText(scope);
  return (
    <Modal title="Markdown で書き出す" onClose={onClose} width={720}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-ink-sub">形</span>
            <select
              value={scope.format}
              className="rounded-md border border-line px-2 py-1"
              onChange={(event) =>
                setScope({
                  ...scope,
                  format: event.target.value as MarkdownFormat,
                })
              }
            >
              <option value="issue">Issue 向け（チェックリスト）</option>
              <option value="ai">AI 向け（要素の詳しい手がかり付き）</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ink-sub">対象</span>
            <select
              value={scope.status}
              className="rounded-md border border-line px-2 py-1"
              onChange={(event) =>
                setScope({
                  ...scope,
                  status: event.target.value as StatusFilter,
                })
              }
            >
              <option value="open">未解決</option>
              <option value="resolved">解決済み</option>
              <option value="all">すべて</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={scope.allPages}
              onChange={(event) =>
                setScope({ ...scope, allPages: event.target.checked })
              }
            />
            すべてのページ
          </label>
        </div>
        <textarea
          aria-label="書き出した Markdown"
          readOnly
          value={text}
          rows={18}
          className="w-full rounded-md border border-line bg-panel-sub p-3 font-mono text-xs leading-relaxed text-ink"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-panel-sub"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([text], { type: "text/markdown" }),
              );
              const link = document.createElement("a");
              link.href = url;
              link.download = fileName(scope);
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download aria-hidden className="size-4" />
            .md を保存
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-white hover:bg-accent-strong"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(onCopied);
            }}
          >
            <Copy aria-hidden className="size-4" />
            コピー
          </button>
        </div>
      </div>
    </Modal>
  );
};
