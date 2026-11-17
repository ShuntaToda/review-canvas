/**
 * API 以外（別のオリジンで配る Storybook など）を読む。資格情報（Cookie）は付けない
 * （API のトークンは apiClient だけが付ける。ここを通す読み込みには何も載せない）
 */
export const fetchWithoutCredentials = (url: string): Promise<Response> =>
  fetch(url, { credentials: "omit" });
