import { useState } from "react";
import { Button } from "../components/Button";
import { ProductImage } from "../components/ProductImage";
import { ShopLayout } from "../components/ShopLayout";
import { type CartItem, countOf, subtotalOf, yen } from "../data/shop";

/** 1 つの商品を一度に買える数 */
const QUANTITY_LIMIT = 5;

/** カート。数量は画面の中だけで変える（サンプルなので送り先は無い） */
export const Cart = ({ items: initialItems }: { items: CartItem[] }) => {
  const [items, setItems] = useState(initialItems);
  const change = (id: string, delta: number) =>
    setItems((current) =>
      current.map((item) =>
        item.product.id === id
          ? {
              ...item,
              quantity: Math.min(
                QUANTITY_LIMIT,
                Math.max(1, item.quantity + delta),
              ),
            }
          : item,
      ),
    );
  const atLimit = items.some((item) => item.quantity >= QUANTITY_LIMIT);

  return (
    <ShopLayout cartCount={countOf(items)}>
      <h1>カート</h1>
      {items.length === 0 ? (
        <div className="panel">
          <p>カートに商品がありません</p>
          <Button>商品を探す</Button>
        </div>
      ) : (
        <div className="stack">
          <div className="panel">
            <ul className="lines">
              {items.map((item) => (
                <li
                  key={item.product.id}
                  className="line"
                  data-testid="cart-line"
                >
                  <div className="line-image">
                    <ProductImage
                      art={item.product.art}
                      color={item.product.color}
                    />
                  </div>
                  <div>
                    <h2>{item.product.name}</h2>
                    <p className="muted">{yen(item.product.price)}</p>
                  </div>
                  <div className="quantity">
                    <button
                      type="button"
                      disabled={item.quantity <= 1}
                      onClick={() => change(item.product.id, -1)}
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      disabled={item.quantity >= QUANTITY_LIMIT}
                      onClick={() => change(item.product.id, 1)}
                    >
                      ＋
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {atLimit && (
            <p className="notice" role="status">
              一度に買えるのは 5 個までです
            </p>
          )}
          <div className="panel">
            <dl className="summary summary-large">
              <dt>小計</dt>
              <dd>{yen(subtotalOf(items))}</dd>
            </dl>
            <div className="actions">
              <Button>レジに進む</Button>
              <Button className="button button-secondary">
                買い物を続ける
              </Button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};
