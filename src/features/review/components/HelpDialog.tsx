import { SHORTCUT_HELP } from "../model/shortcuts";
import { Modal } from "./Modal";
import { MissingMark } from "./Pin";

/**
 * 使い方とショートカットの一覧
 */
export const HelpDialog = ({ onClose }: { onClose: () => void }) => (
  <Modal title="使い方・ショートカット" onClose={onClose} width={520}>
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-ink-sub">
        Storybook
        の画面（ストーリー）を、画面ごとに1行・状態ごとに横へ並べています。
        「コメント」で画面をクリックするとピンを置けます。コメントはブランチごとに分かれます。上の「ブランチ」で、ほかのブランチの
        Storybook とコメントに切り替えられます（「ビルドなし」はコメントだけ）。
      </p>
      <ul className="flex flex-col gap-1.5 text-ink-sub" aria-label="ピンの印">
        <li className="flex items-center gap-2">
          <span
            aria-hidden
            className="relative size-4 shrink-0 rounded-full rounded-bl-none bg-accent"
          >
            <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-warn ring-2 ring-panel" />
          </span>
          右上の点:
          いまと違う幅の表示で書かれ、指していた要素の記録が無いか見つからないピン（位置がずれているかもしれません）
        </li>
        <li className="flex items-center gap-2">
          <MissingMark />
          「?」:
          指していた要素がいまの画面で見つからないピン。置いたときの位置に出しています（一覧にも同じ印が付きます）
        </li>
      </ul>
      <table className="w-full border-collapse">
        <tbody>
          {SHORTCUT_HELP.map(({ keys, label }) => (
            <tr key={keys} className="border-t border-line">
              <th
                scope="row"
                className="py-1.5 pr-4 text-left font-mono text-xs font-normal whitespace-nowrap text-ink"
              >
                {keys}
              </th>
              <td className="py-1.5 text-ink-sub">{label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Modal>
);
