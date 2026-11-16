#!/usr/bin/env node
// 手元の設定（.env）が無ければ、見本（.env.example）を写す。あれば何もしない（手で直した値を消さない）
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".env");
if (!existsSync(target)) {
  copyFileSync(join(root, ".env.example"), target);
  console.log(".env.example から .env を作りました");
}
