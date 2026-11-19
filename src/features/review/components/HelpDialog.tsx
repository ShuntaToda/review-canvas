import { SHORTCUT_HELP } from "../model/shortcuts";
import { Modal } from "./Modal";
import { MissingMark } from "./Pin";

/**
 * 使い方とショートカットの一覧
 */
export const HelpDialog = ({ onClose }: { onClose: () => void }) => (
  <Modal title="使い方・ショートカット" onClose={onClose} width={520}>
    <div className="flex flex-col gap-3 text-sm">
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-ink-sub">
        <li>
          Storybook
          の画面を、画面ごとに1段・状態ごとに横へ並べています。上の「コメント」を選んで画面をクリックすると、ピンを置いてコメントを書けます。
        </li>
        <li>
          並んでいるのは、置いたときに撮った画像です。クリックする・大きく寄る・「コメント」や「操作」で指すと、その1枚だけ動く画面に切り替わります。
        </li>
        <li>
          幅は上の「幅」で切り替えます。一覧に無い幅は「幅を足す」に px
          を入れると自分用に足せます（このブラウザだけに覚え、ほかの人には出ません。足した幅は画像が無いので、動く画面を読み込みます）。
        </li>
        <li>
          コメントはブランチごとに分かれます。上の「ブランチ」で、ほかのブランチの画面とコメントに切り替えられます（「コメントのみ」は画面を置いていないブランチ）。
        </li>
        <li>
          上の「画面のつながり」で、画面から画面への矢印を出します（選んだ画面／すべて／出さない）。札を押すと行き先の画面へ寄り、左上の「←
          …へ戻る」で元の見え方に戻ります（1
          段ずつ、何段でも戻れます）。画像を撮っていない幅・ブランチでは出ません。
        </li>
        <li className="flex list-none items-center gap-2">
          <MissingMark />
          <span>
            「?」の付いたピン:
            指していた要素がいまの画面で見つからず、置いたときの位置に出しています
          </span>
        </li>
      </ul>
      <table className="w-full border-collapse">
        <tbody>
          {SHORTCUT_HELP.map(({ keys, label }) => (
            <tr key={keys} className="border-t border-line">
              <th
                scope="row"
                className="py-1.5 pr-4 text-left font-mono text-xs font-normal text-ink"
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
