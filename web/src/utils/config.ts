// src/utils/config.ts
// 0.5% default (0.005)
export const FEE_RATE =
  Number(process.env.NEXT_PUBLIC_FEE_RATE ?? process.env.REACT_APP_FEE_RATE ?? '0.005');

export const BACKGROUND_IMAGES = [
  '/assets/images/background-10.webp',
  '/assets/images/background-20.webp',
  '/assets/images/background-30.webp',
  '/assets/images/background-40.webp',
  '/assets/images/background-50.webp',
];
