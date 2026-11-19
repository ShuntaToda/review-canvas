// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DisplaySettings } from "./DisplaySettings";

afterEach(() => cleanup());

const onWidthChange = vi.fn();
const onWidthRemove = vi.fn();

afterEach(() => vi.clearAllMocks());

const renderSettings = ({ width = 1280 }: { width?: number } = {}) =>
  render(
    <DisplaySettings
      showComponents={false}
      onShowComponentsChange={() => undefined}
      width={width}
      widthOptions={[
        { width: 1280, custom: false },
        { width: 1000, custom: true },
      ]}
      onWidthChange={onWidthChange}
      onWidthRemove={onWidthRemove}
      perRow={4}
      onPerRowChange={() => undefined}
    />,
  );

describe("DisplaySettings", () => {
  test("[正常系]幅の切り替えには、設定の幅に続けて自分で足した幅を「自分用」の印つきで出す", () => {
    renderSettings();

    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(expect.arrayContaining(["1280px", "1000px（自分用）"]));
  });

  test("[正常系]好きな px を入れて追加すると、その幅を選ぶ（足すかどうかは受け取る側が決める。欄は空に戻す）", () => {
    renderSettings();
    const input = screen.getByLabelText<HTMLInputElement>("足す幅（px）");

    fireEvent.change(input, { target: { value: "1440px" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(1440);
    expect(input.value).toBe("");
  });

  test("[正常系]もう一覧にある幅を入れても、同じようにその幅を選ぶ", () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText("足す幅（px）"), {
      target: { value: "1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(1000);
  });

  test("[異常系]幅にならない値は足さず、欄に印を付ける", () => {
    renderSettings();
    const input = screen.getByLabelText("足す幅（px）");

    fireEvent.change(input, { target: { value: "広め" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(onWidthChange).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  test("[正常系]自分で足した幅を選んでいるときだけ、その幅を外す操作を出す", () => {
    renderSettings();
    expect(screen.queryByRole("button", { name: /を外す/ })).toBeNull();
    cleanup();

    renderSettings({ width: 1000 });
    fireEvent.click(screen.getByRole("button", { name: "1000px を外す" }));

    expect(onWidthRemove).toHaveBeenCalledExactlyOnceWith(1000);
  });
});
