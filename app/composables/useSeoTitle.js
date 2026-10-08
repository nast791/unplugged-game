/**
 * Заголовок вкладки страницы: строка — статика, функция — динамика.
 *
 * Nuxt мету `definePageMeta` в head не выводит, поэтому заголовок ставит сам композабл;
 * шаблон — `app.head.titleTemplate`.
 */
export const useSeoTitle = title => {
  useHead({
    title: () => (typeof title === 'function' ? title() : unref(title)) || '',
  });
};
