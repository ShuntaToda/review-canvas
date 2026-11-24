/** 絵の形（商品の画像はコードの中に書いた絵。外の画像は使わない） */
export type ProductArt = "mug" | "bag" | "plate" | "towel" | "cutlery" | "vase";

/** 商品（サンプルなので、名前・価格・説明は作ったもの） */
export type Product = {
  id: string;
  name: string;
  price: number;
  description: string;
  art: ProductArt;
  /** 絵の色 */
  color: string;
  soldOut?: boolean;
  isNew?: boolean;
};

export const products: Product[] = [
  {
    id: "p1",
    name: "木のマグカップ",
    price: 2400,
    description:
      "山桜の木をくり抜いて作ったマグカップです。手になじむ軽さで、温かい飲み物が冷めにくくなります。",
    art: "mug",
    color: "#c8a27a",
    isNew: true,
  },
  {
    id: "p2",
    name: "麻のトートバッグ",
    price: 3800,
    description:
      "厚手の麻で縫ったトートバッグです。A4 の書類が入り、使うほどに柔らかくなります。",
    art: "bag",
    color: "#b9b49a",
  },
  {
    id: "p3",
    name: "陶器の小皿（2 枚組）",
    price: 1800,
    description:
      "薄い藍色の釉薬をかけた小皿の 2 枚組です。取り皿や薬味入れに使えます。",
    art: "plate",
    color: "#9fb7c4",
  },
  {
    id: "p4",
    name: "手ぬぐい",
    price: 1200,
    description:
      "綿の生地を染めた手ぬぐいです。よく乾くので、台所でも旅先でも使えます。",
    art: "towel",
    color: "#d9a0a0",
    soldOut: true,
  },
  {
    id: "p5",
    name: "竹のカトラリー（3 本組）",
    price: 1600,
    description:
      "竹で作ったスプーン・フォーク・ナイフの 3 本組です。持ち歩き用の袋が付きます。",
    art: "cutlery",
    color: "#a7b98a",
  },
  {
    id: "p6",
    name: "ガラスの一輪挿し",
    price: 2200,
    description: "吹きガラスの一輪挿しです。泡の入り方が 1 つずつ違います。",
    art: "vase",
    color: "#9ec9c0",
  },
];

/** ID から商品を引く */
export const productOf = (id: string): Product => {
  const product = products.find((item) => item.id === id);
  if (product === undefined) throw new Error(`商品 ${id} がありません`);
  return product;
};

/** カートの 1 行 */
export type CartItem = { product: Product; quantity: number };

/** カート・注文の確認・完了・マイページでそろえる品目 */
export const cartItems: CartItem[] = [
  { product: productOf("p1"), quantity: 2 },
  { product: productOf("p2"), quantity: 1 },
];

/** 送料（円） */
export const SHIPPING_FEE = 600;

export const subtotalOf = (items: CartItem[]): number =>
  items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

export const countOf = (items: CartItem[]): number =>
  items.reduce((sum, item) => sum + item.quantity, 0);

/** お届け先（架空の名前とメールアドレス） */
export type Address = { name: string; email: string };

export const sampleAddress: Address = {
  name: "山田 太郎",
  email: "taro@example.com",
};

/** 注文 1 件（マイページの履歴） */
export type Order = {
  number: string;
  orderedOn: string;
  items: CartItem[];
  total: number;
};

/** いま確定した注文（完了・マイページの履歴の先頭） */
export const latestOrder: Order = {
  number: "SS-20261124-0042",
  orderedOn: "2026 年 11 月 24 日",
  items: cartItems,
  total: subtotalOf(cartItems) + SHIPPING_FEE,
};

/** お届けの予定 */
export const DELIVERY_DATE = "2026 年 11 月 27 日（金）";

export const yen = (amount: number): string =>
  `${amount.toLocaleString("ja-JP")} 円`;
