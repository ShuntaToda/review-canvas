import { Button } from "../components/Button";
import { ProductImage } from "../components/ProductImage";
import { ShopLayout } from "../components/ShopLayout";
import { type Product, yen } from "../data/shop";
import { useJson } from "../data/useJson";

/** 商品一覧。/api/products から読む（Storybook では msw が返す） */
export const ProductList = ({ cartCount }: { cartCount: number }) => {
  const { data: products, failed } = useJson<Product[]>("/api/products");

  return (
    <ShopLayout cartCount={cartCount}>
      <h1>商品一覧</h1>
      {failed && <p className="error">商品を読み込めませんでした</p>}
      {!failed && products === null && <p>読み込み中…</p>}
      {products !== null && products.length === 0 && <p>商品がありません</p>}
      {products !== null && products.length > 0 && (
        <ul className="grid" aria-label="商品">
          {products.map((product) => (
            <li key={product.id} className="card" data-testid="product-card">
              <ProductImage art={product.art} color={product.color} />
              <div className="card-body">
                <div className="tags">
                  {product.isNew === true && (
                    <span className="tag">新入荷</span>
                  )}
                  {product.soldOut === true && (
                    <span className="tag tag-muted">在庫切れ</span>
                  )}
                </div>
                <h2>
                  <a href={`#product-${product.id}`}>{product.name}</a>
                </h2>
                <p className="price">{yen(product.price)}</p>
                <Button disabled={product.soldOut === true}>
                  カートに入れる
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ShopLayout>
  );
};
