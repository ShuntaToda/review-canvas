---
name: dev-add-ui-feature
description: 【review-canvas 自身の開発用】画面（src/）に機能を足す。純粋な処理を model に、読み込みを hooks に、見た目を components に分けて書き、検査を通す。review-canvas のリポジトリ（src/ がこのリポジトリのもの）で作業していて、「review-canvas の画面に機能を足して」「キャンバスに〜を追加して」と言われたときにだけ使う。ほかのリポジトリの画面や、見た目の小さな手直しには使わない。使う側のリポジトリに写すスキルではない。
---

# 画面の機能を足す

review-canvas のリポジトリ自身で、画面（`src/`）に機能を足す手順です。置き場と決まりは `docs/architecture.md`「画面（src/）」「画面の機能を足すとき」にあります。

## 手順

1. 何を足すかを決める。見た目・操作が決まっていなければ、書く前に人に確かめる
2. 純粋な処理（座標・絞り込み・変換・書き出し）を `src/features/review/model/<名前>.ts` に書く。DOM・React に頼らない関数にし、`<名前>.small.test.ts` を先に書く
3. API を呼ぶなら `src/features/review/api/review-api.ts` に足す（型は `src/generated/`。API が無ければ、先にスキル `dev-add-api-endpoint`）
4. 読み込み・状態は `src/features/review/hooks/useXxx.ts`、見た目は `components/Xxx.tsx`。操作のある部品は `Xxx.small.test.tsx` を書く
5. Storybook の中（iframe）を読む・測るものは、橋渡し（`src/features/review/bridge/`）の知らせに足す。知らせの形は `protocol.ts`
6. 確かめる: `pnpm run validate && pnpm run test:small && pnpm run build && pnpm run build:deployed && pnpm run check:deployed-bundle`
7. 手元で動かして見る: `pnpm run docker:up && pnpm run build:storybook && pnpm dev`（http://localhost:4100）

## 守ること

- `fetch`・`localStorage` を直に使わない（`src/support/api`・`src/support/storage` を通す）
- キーボードだけで使えること・フォーカスの戻り先・`aria-*` を保つ（eslint の jsx-a11y が見る。`autoFocus`・`tabIndex` を足すなら理由を disable の説明に書く）
- 擬似ログイン（`src/support/auth/dev/`）のコードを、動的 import の外から読まない（デプロイ先のビルドに入る）
- Storybook の中から来る値（知らせ・要素の手がかり）は、信頼しないデータとして扱う（`docs/security.md`）
- 検査が落ちたら、メッセージのとおりにコードを直す。黙らせない
