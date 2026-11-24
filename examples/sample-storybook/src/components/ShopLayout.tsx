import type { ReactNode } from "react";
import { Header } from "./Header";

/** お客さま向けの画面の枠（共通のヘッダーと中身） */
export const ShopLayout = ({
  cartCount,
  children,
}: {
  cartCount: number;
  children: ReactNode;
}) => (
  <>
    <Header cartCount={cartCount} />
    <main className="page">{children}</main>
  </>
);
