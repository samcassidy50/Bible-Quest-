/** Device safe-area insets (notch, Dynamic Island, home indicator) in CSS pixels. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function readSafeAreaInsets(): Insets {
  const el = document.getElementById('safe-area-probe');
  if (!el) return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  return {
    top: px(s.paddingTop),
    right: px(s.paddingRight),
    bottom: px(s.paddingBottom),
    left: px(s.paddingLeft),
  };
}

/** Converts CSS-pixel insets to game-world pixels using the current canvas scale. */
export function toGameInsets(css: Insets, gameWidth: number, canvasCssWidth: number): Insets {
  const k = canvasCssWidth > 0 ? gameWidth / canvasCssWidth : 1;
  return { top: css.top * k, right: css.right * k, bottom: css.bottom * k, left: css.left * k };
}
