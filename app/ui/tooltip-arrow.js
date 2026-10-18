export const ARROW_WIDTH = 'var(--tooltip-tip-width)';
export const ARROW_HEIGHT = 'calc(var(--tooltip-tip) + var(--tooltip-border))';
export const ARROW_PATH = 'M0 0 L5 9.2 Q8 14.8 11 9.2 L16 0 Z';
export const ARROW_EDGE =
  'M0 0 L5 9.2 Q8 14.8 11 9.2 L16 0 L13.72 0 L9.24 8.24 Q8 11.76 6.76 8.24 L2.28 0 Z';
export const ARROW_VIEW_BOX = '0 0 16 12';

export const ARROW_STYLE = {
  position: 'relative',
  width: ARROW_WIDTH,
  height: ARROW_HEIGHT,
  top: 'calc(-1 * var(--tooltip-border))',
};

export default { ARROW_WIDTH, ARROW_HEIGHT, ARROW_PATH, ARROW_EDGE, ARROW_VIEW_BOX, ARROW_STYLE };
