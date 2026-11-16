import { handle } from "hono/aws-lambda";
import { buildApp } from "../../app";
import { registerContainer } from "@/di-container/register-container";
import {
  REVIEWER_TOKEN_VERIFIER,
  PUBLISHED_STORYBOOKS,
} from "@/di-container/service-id";

/**
 * Lambda の入口（CloudFront → Lambda の関数 URL。review-canvas/infra の ReviewCanvasStack）。
 * 環境変数は Lambda の設定で渡す（.env は読まない）。
 * トークンの検証（AUTH_MODE・AUTH0_ISSUER・AUTH0_AUDIENCE）と Storybook の置き場（STORYBOOK_BUCKET・DEFAULT_BRANCH）は起動時に解決し、
 * 設定の誤りを最初のリクエストを待たずに例外で止める
 */
const container = registerContainer();
container.get(REVIEWER_TOKEN_VERIFIER);
container.get(PUBLISHED_STORYBOOKS);
const app = buildApp({ container });

export const handler = handle(app);
