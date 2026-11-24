import { Button } from "../components/Button";
import { ShopLayout } from "../components/ShopLayout";
import { type Order, yen } from "../data/shop";

/** マイページ。注文の履歴を新しい順に出す */
export const MyPage = ({
  orders,
  cartCount,
}: {
  orders: Order[];
  cartCount: number;
}) => (
  <ShopLayout cartCount={cartCount}>
    <h1>マイページ</h1>
    <section className="panel">
      <h2>注文の履歴</h2>
      {orders.length === 0 ? (
        <>
          <p>まだ注文がありません</p>
          <Button>商品を探す</Button>
        </>
      ) : (
        <ul className="lines">
          {orders.map((order) => (
            <li key={order.number} className="history">
              <p>
                {order.orderedOn}・{order.number}
              </p>
              <p className="muted">
                {order.items
                  .map((item) => `${item.product.name} × ${item.quantity}`)
                  .join("、")}
              </p>
              <p className="price">{yen(order.total)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  </ShopLayout>
);
