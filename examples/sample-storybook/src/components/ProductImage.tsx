import type { ReactNode } from "react";
import type { ProductArt } from "../data/shop";

/** 商品の形ごとの絵（色は商品ごと） */
const shapes: Record<ProductArt, (color: string) => ReactNode> = {
  mug: (color) => (
    <>
      <rect x="56" y="34" width="40" height="46" rx="6" fill={color} />
      <path
        d="M96 44 h8 a10 10 0 0 1 0 24 h-8"
        fill="none"
        stroke={color}
        strokeWidth="6"
      />
    </>
  ),
  bag: (color) => (
    <>
      <path
        d="M66 42 v-8 a14 14 0 0 1 28 0 v8"
        fill="none"
        stroke={color}
        strokeWidth="5"
      />
      <path d="M52 42 h56 l-4 44 h-48 z" fill={color} />
    </>
  ),
  plate: (color) => (
    <>
      <ellipse cx="70" cy="62" rx="30" ry="12" fill={color} />
      <ellipse cx="70" cy="60" rx="20" ry="7" fill="#ffffff" opacity="0.5" />
      <ellipse cx="96" cy="74" rx="26" ry="10" fill={color} opacity="0.8" />
    </>
  ),
  towel: (color) => (
    <>
      <rect x="50" y="30" width="60" height="52" rx="4" fill={color} />
      <path
        d="M50 46 h60 M50 62 h60"
        stroke="#ffffff"
        strokeWidth="4"
        opacity="0.6"
      />
    </>
  ),
  cutlery: (color) => (
    <>
      <ellipse cx="62" cy="40" rx="7" ry="10" fill={color} />
      <rect x="59" y="48" width="6" height="36" rx="3" fill={color} />
      <path
        d="M74 30 v16 M80 30 v16 M86 30 v16"
        stroke={color}
        strokeWidth="3"
      />
      <rect x="77" y="44" width="6" height="40" rx="3" fill={color} />
      <path d="M98 30 q8 14 0 30 z" fill={color} />
      <rect x="95" y="56" width="6" height="28" rx="3" fill={color} />
    </>
  ),
  vase: (color) => (
    <>
      <path
        d="M74 30 h12 v12 q16 10 12 30 q-4 12 -18 12 q-14 0 -18 -12 q-4 -20 12 -30 z"
        fill={color}
      />
      <path
        d="M80 30 q-2 -10 6 -18"
        stroke="#6b8f5a"
        strokeWidth="3"
        fill="none"
      />
      <circle cx="87" cy="12" r="5" fill="#e07a3f" />
    </>
  ),
};

/** 商品の画像（コードの中に書いた絵。撮るときに外の画像を読まない） */
export const ProductImage = ({
  art,
  color,
  className = "product-image",
}: {
  art: ProductArt;
  color: string;
  className?: string;
}) => (
  <svg className={className} viewBox="0 0 160 110" aria-hidden="true">
    <rect width="160" height="110" fill={color} opacity="0.2" />
    <ellipse cx="80" cy="90" rx="40" ry="6" fill={color} opacity="0.35" />
    {shapes[art](color)}
  </svg>
);
