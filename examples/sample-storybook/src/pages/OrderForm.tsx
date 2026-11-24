import { type FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Header } from "../components/Header";

/** お届け先の入力。送ると入力の確かめだけを行う（サンプルなので送り先は無い。行き先の注文の確認はストーリーの遷移で書く） */
export const OrderForm = ({ cartCount }: { cartCount: number }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: string[] = [];
    if (name.trim() === "") next.push("お名前を入力してください");
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) {
      next.push("メールアドレスの形が違います");
    }
    setErrors(next);
  };

  return (
    <>
      <Header cartCount={cartCount} />
      <main className="page">
        <h1>お届け先の入力</h1>
        <form
          aria-label="お届け先"
          className="panel"
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
          {errors.map((error) => (
            <p key={error} className="error" role="alert">
              {error}
            </p>
          ))}
          <Button type="submit">確認へ進む</Button>
        </form>
      </main>
      {/* 画面の高さに合わせて伸びる下の帯（100vh の画面の高さの測り方を試す） */}
      <footer className="footer" style={{ minHeight: "100vh" }}>
        サンプルショップ
      </footer>
    </>
  );
};
