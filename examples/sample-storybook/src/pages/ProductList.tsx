import { useEffect, useState } from "react";
import { Button } from "../components/Button";

export type Product = { id: string; name: string; price: number };

/** 商品一覧。/api/products から読む（Storybook では msw が返す） */
export const ProductList = () => {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/products")
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as Product[];
      })
      .then((items) => {
        if (alive) setProducts(items);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="page">
      <h1>商品一覧</h1>
      {failed && <p className="error">商品を読み込めませんでした</p>}
      {!failed && products === null && <p>読み込み中…</p>}
      {products !== null && products.length === 0 && <p>商品がありません</p>}
      {products !== null && products.length > 0 && (
        <ul className="grid" aria-label="商品">
          {products.map((product) => (
            <li key={product.id} className="card" data-testid="product-card">
              <h2>{product.name}</h2>
              <p>{product.price.toLocaleString("ja-JP")} 円</p>
              <Button>カートに入れる</Button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
