import { useEffect, useState } from "react";

/** API（Storybook では msw が返す）から JSON を読む。読み終えるまでは data が null */
export const useJson = <T>(
  url: string,
): { data: T | null; failed: boolean } => {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        return (await response.json()) as T;
      })
      .then((value) => {
        if (alive) setData(value);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, failed };
};
