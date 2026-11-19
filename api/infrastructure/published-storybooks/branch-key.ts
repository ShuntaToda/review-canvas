/**
 * ブランチ名を配信の置き場（sb/<キー>/）の 1 つの区切りにする。
 * 英数字と . _ - はそのまま、ほかのバイト（/ や ~ や日本語）は UTF-8 の 1 バイトずつ ~XX（大文字の16進）にする。
 * 例: claude/x-y → claude~2Fx-y。逆に戻せて、別のブランチが同じキーにならない。
 * 配信へ置くスクリプト（review-canvas/infra/scripts/branch-key.ts）と、自身の画面のストーリー（src/features/review/stories/story-branches.ts の storyBranchKey）にも
 * 同じものがある（同じテストの例で揃える）
 */
export const encodeBranchKey = (branch: string): string => {
  if (branch === "" || branch === "." || branch === "..") {
    throw new Error(`ブランチ名として使えません: ${JSON.stringify(branch)}`);
  }
  let key = "";
  for (const byte of new TextEncoder().encode(branch)) {
    const char = String.fromCharCode(byte);
    key += /^[A-Za-z0-9._-]$/.test(char)
      ? char
      : `~${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return key;
};

/** encodeBranchKey の逆。キーの形でなければ null */
export const decodeBranchKey = (key: string): string | null => {
  if (!/^(?:[A-Za-z0-9._-]|~[0-9A-F]{2})+$/.test(key)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < key.length; i += 1) {
    if (key[i] === "~") {
      bytes.push(Number.parseInt(key.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(key.charCodeAt(i));
    }
  }
  try {
    const branch = new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(bytes),
    );
    // 符号化の揺れ（~41 と A など）は同じブランチにしない
    return encodeBranchKey(branch) === key ? branch : null;
  } catch {
    return null;
  }
};
