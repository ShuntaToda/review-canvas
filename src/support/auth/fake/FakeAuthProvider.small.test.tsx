// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { AppAuthProvider } from "../AppAuthProvider";
import { AuthGate } from "../AuthGate";
import { useAuth } from "../auth-client";
import { FAKE_ACCESS_TOKEN } from "./FakeAuthProvider";
import { createFakeAuthModule } from "./index";

/**
 * ストーリー用の偽のログインを、ログインの入口（AuthGate）に組み込んだまま確かめる
 */
const Me = () => {
  const { user, getAccessTokenSilently, loginWithRedirect, logout } = useAuth();
  return (
    <>
      <p>{user?.name}</p>
      <button
        type="button"
        onClick={() =>
          void Promise.all([
            loginWithRedirect(),
            logout(),
            getAccessTokenSilently(),
          ]).then(([, , token]) => {
            document.title = token;
          })
        }
      >
        操作
      </button>
    </>
  );
};

const open = (user: { sub: string; name: string } | undefined) =>
  render(
    <AppAuthProvider auth={createFakeAuthModule(user)}>
      <AuthGate>
        <Me />
      </AuthGate>
    </AppAuthProvider>,
  );

afterEach(cleanup);

describe("createFakeAuthModule", () => {
  test("渡した利用者でログイン済みになり、ログイン・ログアウトは何もせず、決まったトークンを返す", async () => {
    open({ sub: "auth0|yamada", name: "山田 太郎" });

    expect(screen.getByText("山田 太郎")).toBeTruthy();
    screen.getByRole("button", { name: "操作" }).click();
    await vi.waitFor(() => expect(document.title).toBe(FAKE_ACCESS_TOKEN));
    expect(screen.getByText("山田 太郎")).toBeTruthy();
  });

  test("利用者を渡さなければログインしていない（ログインの画面を持たないので、ログインへ移ると知らせる）", () => {
    open(undefined);

    expect(screen.getByText("ログインの画面へ移ります…")).toBeTruthy();
  });
});
