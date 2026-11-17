import path from "node:path";

/** kebab-case のファイル名（拡張子なし）を PascalCase にする（create-comment-use-case → CreateCommentUseCase） */
export const pascalOf = (kebab) =>
  kebab
    .split("-")
    .filter((part) => part !== "")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

/** ファイルのパスから、拡張子を除いた名前を取る */
export const baseNameOf = (filename) =>
  path.basename(filename).replace(/\.[^.]+$/, "");
