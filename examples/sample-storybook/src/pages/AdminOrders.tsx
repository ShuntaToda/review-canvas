/** 注文 1 件（サンプルなので、名前と金額は作ったもの） */
export type AdminOrder = {
  id: string;
  customer: string;
  total: number;
  status: "未発送" | "発送済み";
};

/**
 * 管理画面の注文の一覧。左にサイドバー、右に一覧を置き、入れ物の高さを画面に合わせる（height: 100vh）。
 * 一覧は入れ物から下へはみ出し、ページがスクロールする（入れ物の外へはみ出す画面の高さの測り方を試す）
 */
export const AdminOrders = ({ orders }: { orders: AdminOrder[] }) => (
  <div className="admin" style={{ height: "100vh" }}>
    <nav className="admin-sidebar" aria-label="管理メニュー">
      <p className="admin-brand">サンプルショップ</p>
      <ul>
        <li>
          <a href="#orders" aria-current="page">
            注文
          </a>
        </li>
        <li>
          <a href="#products">商品</a>
        </li>
        <li>
          <a href="#customers">お客さま</a>
        </li>
      </ul>
    </nav>
    <main className="admin-main" id="orders">
      <h1>注文の一覧</h1>
      <ul className="admin-orders">
        {orders.map((order) => (
          <li key={order.id} className="card">
            <h2>{order.id}</h2>
            <p>
              {order.customer} 様・{order.total.toLocaleString("ja-JP")} 円・
              {order.status}
            </p>
          </li>
        ))}
      </ul>
    </main>
  </div>
);
