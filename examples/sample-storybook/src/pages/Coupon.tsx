import { type FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { ShopLayout } from "../components/ShopLayout";

/** サンプルで使えるクーポンコード（送り先が無いので、画面の中で比べる） */
const SAMPLE_COUPON_CODE = "SAMPLE10";

/** クーポン。使えないコードを送ると誤りを出す（使えたときの行き先は決めていない） */
export const Coupon = ({ cartCount }: { cartCount: number }) => {
  const [code, setCode] = useState("");
  const [failed, setFailed] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailed(code.trim() !== SAMPLE_COUPON_CODE);
  };

  return (
    <ShopLayout cartCount={cartCount}>
      <h1>クーポン</h1>
      <div className="stack">
        <form aria-label="クーポン" className="panel" onSubmit={submit}>
          <div className="field">
            <label htmlFor="coupon-code">クーポンコード</label>
            <input
              id="coupon-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {failed && (
            <p className="error" role="alert">
              このクーポンは使えません
            </p>
          )}
          <Button type="submit">適用する</Button>
        </form>
        <p>
          <a href="#cart">カートに戻る</a>
        </p>
      </div>
    </ShopLayout>
  );
};
