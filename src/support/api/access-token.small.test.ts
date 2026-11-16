import { createAccessTokenSlot } from "./access-token";

describe("createAccessTokenSlot", () => {
  test("[正常系]置かれたトークンの取り方を返す", async () => {
    const slot = createAccessTokenSlot();
    const source = () => Promise.resolve("token");
    slot.set(source);

    expect(await slot.get()).toBe(source);
  });

  test("[正常系]置かれる前に求められたら、置かれるまで待ってから返す", async () => {
    const slot = createAccessTokenSlot();
    const pending = slot.get();
    const source = () => Promise.resolve("token");

    slot.set(source);

    expect(await pending).toBe(source);
  });

  test("[正常系]下ろした後は、次に置かれるまで待つ", async () => {
    const slot = createAccessTokenSlot();
    slot.set(() => Promise.resolve("old"));
    slot.set(undefined);
    let resolved = false;
    const pending = slot.get().then((source) => {
      resolved = true;
      return source;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    const next = () => Promise.resolve("new");
    slot.set(next);

    expect(await pending).toBe(next);
  });
});
