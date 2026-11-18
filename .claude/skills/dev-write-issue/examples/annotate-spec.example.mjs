// pnpm --dir infra run annotate-screen points に渡す、論点ごとの指定の見本（架空のサンプルのショップ）。
// 開く画面は examples/sample-order-form.html。自分の論点では、開く画面を手元で動かした review-canvas の画面
// （http://localhost:4100 など）や Storybook のストーリーに替え、sel に要素の CSS セレクタを書く
const SUB =
  "サンプルのショップの注文フォーム（見本の画面）を撮り、赤枠と番号を足したもの";

export default [
  {
    key: "a",
    title: "論点 a　お届け日時の指定のしかた",
    sub: SUB,
    clip: ["main"],
    marks: [
      { sel: "#delivery-date", n: "1" },
      { sel: "#delivery-time", n: "2", strike: true },
    ],
    notes: [
      [
        "1",
        "お届け日は、注文の 3 日後から 14 日後までを選べる（決定済み）。<b>ここで決めたいのは、時間帯も選べるようにするか</b>",
      ],
      ["2", "時間帯の選択肢。a2 を選ぶと、この欄は無くなる（斜線）"],
      [
        "",
        "（画面に無い）選べない日を送ったときの文言は「お届け日を選び直してください」とする",
      ],
    ],
    options: [
      [
        "★a1　日付と時間帯を選べる（今の画面のとおり）",
        "配送の時間帯がそのまま使え、受け取れないことが減る",
      ],
      ["a2　日付だけ選べる", "画面は短くなるが、時間帯の問い合わせが増える"],
    ],
  },
  {
    key: "b",
    title: "論点 b　選べない日を送ったときの見せ方",
    sub: `${SUB}（「注文を確かめる」を押して、誤りの状態を作って撮ったもの）`,
    setup: async (page) => {
      await page.click("#submit");
    },
    clip: ["main"],
    marks: [{ sel: "#delivery-date", n: "1" }],
    notes: [
      [
        "1",
        "お届け日の欄を赤くし、その下に理由を出す。<b>ここで決めたいのは、入力済みの日付を消すか残すか</b>",
      ],
    ],
    options: [
      ["★b1　残す", "どの日を選んだかが分かり、選び直しやすい"],
      ["b2　消す", "選び直してもらう意図ははっきりするが、手間が増える"],
    ],
  },
];
