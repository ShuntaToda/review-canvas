import { Button } from "../components/Button";
import { ShopLayout } from "../components/ShopLayout";

/** 注文の完了。注文番号とお届けの予定を出す */
export const Complete = ({
  orderNumber,
  deliveryDate,
}: {
  orderNumber: string;
  deliveryDate: string;
}) => (
  <ShopLayout cartCount={0}>
    <div className="panel">
      <h1 className="complete-title">ご注文ありがとうございました</h1>
      <dl className="summary">
        <dt>注文番号</dt>
        <dd>{orderNumber}</dd>
        <dt>お届けの予定</dt>
        <dd>{deliveryDate}</dd>
      </dl>
      <div className="actions">
        <Button>買い物を続ける</Button>
        <Button className="button button-secondary">注文履歴を見る</Button>
      </div>
    </div>
  </ShopLayout>
);
