import { useState } from "react";
import {
  readLocalStorage,
  writeLocalStorage,
} from "@/support/storage/local-storage";

/**
 * ブラウザに覚える設定（画面の幅・横に並べる数など）。parse が undefined を返したら既定の値
 */
export const useLocalSetting = <T>(
  key: string,
  fallback: T,
  {
    parse,
    serialize,
  }: {
    parse: (raw: string) => T | undefined;
    serialize: (value: T) => string;
  },
): [T, (value: T) => void] => {
  const [value, setValue] = useState<T>(() => {
    const raw = readLocalStorage(key);
    return raw === null ? fallback : (parse(raw) ?? fallback);
  });
  const update = (next: T) => {
    setValue(next);
    writeLocalStorage(key, serialize(next));
  };
  return [value, update];
};
