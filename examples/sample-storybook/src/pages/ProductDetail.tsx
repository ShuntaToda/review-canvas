import { Button } from "../components/Button";
import { ProductImage } from "../components/ProductImage";
import { ShopLayout } from "../components/ShopLayout";
import { type Product, yen } from "../data/shop";
import { useJson } from "../data/useJson";

/** 商品詳細。/api/products/<id> から読む（Storybook では msw が返す）。幅 1024 以上で 2 段組み */
export const ProductDetail = ({
  productId,
  cartCount,
}: {
  productId: string;
  cartCount: number;
}) => {
  const { data: product, failed } = useJson<Product>(
    `/api/products/${productId}`,
  );

  return (
    <ShopLayout cartCount={cartCount}>
      {failed && <p className="error">商品を読み込めませんでした</p>}
      {!failed && product === null && <p>読み込み中…</p>}
      {product !== null && (
        <div className="columns">
          <div className="detail-image">
            <ProductImage art={product.art} color={product.color} />
          </div>
          <div>
            {product.soldOut === true && (
              <div className="tags">
                <span className="tag tag-muted">在庫切れ</span>
              </div>
            )}
            <h1>{product.name}</h1>
            <p className="detail-price">{yen(product.price)}</p>
            <p>{product.description}</p>
            <div className="actions">
              <Button disabled={product.soldOut === true}>
                カートに入れる
              </Button>
            </div>
            <p>
              <a href="#products">商品一覧へ戻る</a>
            </p>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};
