import avatar from '~/ui/avatar.js';
import button from '~/ui/button.js';
import checkbox from '~/ui/checkbox.js';
import checkboxGroup from '~/ui/checkbox-group.js';
import dropdown from '~/ui/dropdown.js';
import input from '~/ui/input.js';
import loader from '~/ui/loader.js';
import modal from '~/ui/modal.js';
import picture from '~/ui/picture.js';
import radio from '~/ui/radio.js';
import radioGroup from '~/ui/radio-group.js';
import scroll from '~/ui/scroll.js';
import select from '~/ui/select.js';
import switchPreset from '~/ui/switch.js';
import tabs from '~/ui/tabs.js';
import tooltip from '~/ui/tooltip.js';

/**
 * Пресеты UI — по файлу на компонент (`app/ui/*.js`), здесь они собираются в конфиг приложения
 * (`docs/ui-plan.md` §9.4). Ключ — имя пресета: `useUI('button')` читает `ui.button`.
 *
 * Импорты идут через `~`, а не относительным путём: относительные в dev-сборке Nitro разрешались от
 * корня диска (`Cannot find module 'C:\app\ui\avatar.js'`), alias такой ошибки не даёт.
 *
 * Брейкпоинты (`ui.screens`) сюда не входят: их парсит `nuxt.config.ts` из `--breakpoint-*` в теме CSS.
 */
export default defineAppConfig({
  ui: {
    avatar,
    button,
    checkbox,
    checkboxGroup,
    dropdown,
    input,
    loader,
    modal,
    picture,
    radio,
    radioGroup,
    scroll,
    select,
    switch: switchPreset,
    tabs,
    tooltip,
  },
});
