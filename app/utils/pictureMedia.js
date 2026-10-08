/**
 * Отрицание `(min-width: Npx)` для прелоада: базовый кадр нужен только там, где не подошёл ни один
 * брейкпоинтовый `<source>`, поэтому его `media` — конъюнкция отрицаний.
 */
export const negateMinWidthMedia = list => {
  const parts = list
    .filter(Boolean)
    .map(media =>
      media.replace(
        /\(min-width:\s*([\d.]+)px\)/g,
        (_, px) => `(max-width: ${Number(px) - 0.02}px)`,
      ),
    );

  return parts.length ? parts.join(' and ') : undefined;
};

export default negateMinWidthMedia;
