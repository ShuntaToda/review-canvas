import { useState } from "react";
import type { StorySource } from "../model/sources";

/**
 * 見せる範囲（画面の一覧のフォルダのパス）。範囲はページの中のフォルダなので、ページを替えたら外す
 */
export const useStoryScope = (
  page: StorySource,
  initialScope: string | undefined,
): [string | undefined, (scope: string | undefined) => void] => {
  const [state, setState] = useState({ page, scope: initialScope });
  // ページが替わったら、元のページへ戻っても前の範囲を持ち越さない
  if (state.page !== page) setState({ page, scope: undefined });
  return [
    state.page === page ? state.scope : undefined,
    (scope) => setState({ page, scope }),
  ];
};
