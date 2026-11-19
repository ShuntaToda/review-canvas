import { type FormEvent, useState } from "react";
import { Button } from "../components/Button";

/** 注文フォーム。送ると入力の確かめだけを行う（サンプルなので送り先は無い） */
export const OrderForm = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: string[] = [];
    if (name.trim() === "") next.push("お名前を入力してください");
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
      next.push("メールアドレスの形が違います");
    }
    setErrors(next);
    setSent(next.length === 0);
  };

  return (
    <>
      <main className="page">
        <h1>注文フォーム</h1>
        <form
          aria-label="ご注文内容"
          data-testid="order-form"
          onSubmit={submit}
        >
          <div className="field">
            <label htmlFor="order-name">お名前</label>
            <input
              id="order-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="order-email">メールアドレス</label>
            <input
              id="order-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="order-quantity">数量</label>
            <select
              id="order-quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            >
              {["1", "2", "3"].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          {errors.map((error) => (
            <p key={error} className="error" role="alert">
              {error}
            </p>
          ))}
          {sent && <p role="status">ご注文を受け付けました（サンプル）</p>}
          <Button type="submit">注文する</Button>
          {sent && <Button>買い物を続ける</Button>}
        </form>
      </main>
      {/* 画面の高さに合わせて伸びる下の帯（100vh の画面の高さの測り方を試す） */}
      <footer className="footer" style={{ minHeight: "100vh" }}>
        サンプルショップ
      </footer>
    </>
  );
};
