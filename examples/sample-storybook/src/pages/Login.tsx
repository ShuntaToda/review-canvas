import { type FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { ShopLayout } from "../components/ShopLayout";

/** サンプルで通るパスワード（送り先が無いので、画面の中で比べる） */
const SAMPLE_PASSWORD = "sample-password";

/** ログイン。違うパスワードを送ると誤りを出す（行き先のマイページはストーリーの遷移で書く） */
export const Login = ({ cartCount }: { cartCount: number }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failed, setFailed] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setFailed(password !== SAMPLE_PASSWORD);
  };

  return (
    <ShopLayout cartCount={cartCount}>
      <h1>ログイン</h1>
      <form aria-label="ログイン" className="panel" onSubmit={submit}>
        <div className="field">
          <label htmlFor="login-email">メールアドレス</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">パスワード</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {failed && (
          <p className="error" role="alert">
            メールアドレスかパスワードが違います
          </p>
        )}
        <Button type="submit">ログインする</Button>
      </form>
    </ShopLayout>
  );
};
