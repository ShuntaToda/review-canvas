import { Button } from "../components/Button";
import { ProductImage } from "../components/ProductImage";
import { ShopLayout } from "../components/ShopLayout";
import {
  type Address,
  type CartItem,
  countOf,
  subtotalOf,
  yen,
} from "../data/shop";

/** 注文の確認。幅 1024 以上で 2 段組み（左に注文の中身とお届け先、右に合計） */
export const Confirm = ({
  items,
  shippingFee,
  address,
}: {
  items: CartItem[];
  shippingFee: number;
  address: Address;
}) => {
  const subtotal = subtotalOf(items);
  return (
    <ShopLayout cartCount={countOf(items)}>
      <h1>注文の確認</h1>
      <div className="columns">
        <div className="stack">
          <section className="panel">
            <h2>注文の中身</h2>
            <ul className="lines">
              {items.map((item) => (
                <li key={item.product.id} className="line">
                  <div className="line-image">
                    <ProductImage
                      art={item.product.art}
                      color={item.product.color}
                    />
                  </div>
                  <div>
                    <p>{item.product.name}</p>
                    <p className="muted">
                      {yen(item.product.price)} × {item.quantity}
                    </p>
                  </div>
                  <p>{yen(item.product.price * item.quantity)}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h2>お届け先</h2>
            <p>
              {address.name} 様
              <br />
              {address.email}
            </p>
            <a href="#order-form">お届け先を直す</a>
          </section>
        </div>
        <section className="panel">
          <dl className="summary">
            <dt>小計</dt>
            <dd>{yen(subtotal)}</dd>
            <dt>送料</dt>
            <dd>{yen(shippingFee)}</dd>
            <dt className="total">合計</dt>
            <dd className="total">{yen(subtotal + shippingFee)}</dd>
          </dl>
          <div className="actions">
            <Button>注文を確定する</Button>
          </div>
        </section>
      </div>
    </ShopLayout>
  );
};
