import { computed, toValue } from 'vue';
import { HINTS } from '#shared/constants/hints.js';
import { effectsNoticeText } from '#shared/constants/effects.js';

export const HINT_TONES = { danger: 'danger', wait: 'wait', hint: 'hint' };

const line = value => (typeof value === 'string' ? value.trim() : '');

/**
 * Строка «Важно!» над сообщением: перечисление **своих** постоянных эффектов
 * (`shared/constants/effects.js`). «Важно!» пишется один раз на всё перечисление — фразу даёт словарь.
 */
const noticeOf = effects => {
  const text = effectsNoticeText(effects);
  if (!text) return '';

  return HINTS.client.noticeEffects({ text });
};

/**
 * Что показать в окне подсказки: `notice` — предупреждение об эффектах, `text` — само сообщение,
 * `tone` — тон сообщения. Окна нет (возвращается `null`), если сообщения нет вовсе: ради одной строки
 * «Важно!» окно не поднимается — эффект и так виден кругом у гекса.
 */
export const resolveGameHint = (input = {}) => {
  const notice = noticeOf(input.effects);
  const error = line(input.error);
  if (error) return { notice, text: error, tone: HINT_TONES.danger };

  if (input.aiThinking === true)
    return { notice, text: HINTS.client.aiThinking(), tone: HINT_TONES.wait };

  const hint = line(input.hint);
  if (hint) return { notice, text: hint, tone: HINT_TONES.hint };

  if (input.pending === true)
    return { notice, text: HINTS.client.sending(), tone: HINT_TONES.wait };

  return null;
};

export const useGameHint = (sources = {}) => {
  const hint = computed(() =>
    resolveGameHint({
      error: toValue(sources.error),
      aiThinking: toValue(sources.aiThinking),
      hint: toValue(sources.hint),
      pending: toValue(sources.pending),
      effects: toValue(sources.effects),
    }),
  );

  return { hint };
};

export default useGameHint;
