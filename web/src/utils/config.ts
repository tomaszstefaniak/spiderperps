// 0.5% default (0.005)
export const FEE_RATE =
  Number(process.env.NEXT_PUBLIC_FEE_RATE ?? process.env.REACT_APP_FEE_RATE ?? '0.005');

export const BACKGROUND_IMAGE = [
  '/assets/images/mountain-fin.webp',
];

export const DEFAULT_BACKGROUND = BACKGROUND_IMAGE[0];
