import { useProfile } from './useProfile.js';

/**
 * Готовность лобби: пока ресурсы игры не загружены, ни профиля, ни меню не видно — только лоадер
 * (`docs/ui-plan.md` §2.5). Ресурс сейчас один: контент (`/api/content/setup`) — растровый арт сезона
 * появится позже и встанет в тот же список.
 *
 * Шрифт здесь не ждём: файлы лежат в `public/fonts`, объявлены `@font-face` с `font-display: swap`,
 * поэтому текст показывается сразу подменным начертанием и меняется, когда шрифт готов. Ожидание
 * `document.fonts.ready` только держало бы лоадер без пользы для картинки экрана.
 *
 * Импорт `useProfile` явный, а не автоимпортом Nuxt: композабл появился в середине работы, и рабочая
 * сессия `pnpm dev`, поднятая раньше, знала о нём не всегда — страница падала с `useProfile is not defined`
 * (сборка при этом собиралась, потому что ошибка только в рантайме). Явный импорт снимает эту зависимость.
 */
const MIN_VISIBLE_MS = 700;

export const useLobbyBoot = () => {
  const ready = useState('lobby:ready', () => false);
  const content = useState('lobby:content', () => null);
  const { load } = useProfile();

  /**
   * Boot идёт один раз за загрузку страницы: возврат в лобби из партии лоадер не повторяет, иначе экран
   * мигал бы при каждом заходе.
   */
  const boot = async () => {
    if (ready.value) return;
    const startedAt = Date.now();
    load();

    await $fetch('/api/content/setup')
      .then(data => {
        content.value = data;
      })
      .catch(() => {
        // контент не пришёл — лобби всё равно показываем: меню и профиль от него не зависят
        content.value = null;
      });

    // лоадер не должен мелькать: короткая загрузка выглядит как рывок интерфейса
    const left = MIN_VISIBLE_MS - (Date.now() - startedAt);
    if (left > 0) await new Promise(resolve => setTimeout(resolve, left));

    ready.value = true;
  };

  return { ready, content, boot };
};
