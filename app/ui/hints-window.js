/**
 * Пресет окна подсказок экрана партии (организм `HintsWindow`).
 *
 * Стиль — лобби (`Menu`): тёмная карточка с градиентной рамкой и мягким свечением по краю, поэтому окно
 * читается и на светлом теле экрана партии, и на тёмном фоне лобби. Тон строки (`hint` / `wait` /
 * `danger`) меняет только цвет иконки и текста: сама рамка одна, чтобы окно не «мигало» разными цветами
 * на каждом шаге.
 *
 * **Высота ограничена тремя строками** `text-18` при `leading-[1.2]` (18 × 1,2 × 3 ≈ 65): этого хватает
 * подсказкам движка («Ваш ход: возьмите карту из колоды, чтобы переместиться, или разыграйте карту
 * атаки» — две строки на 1920 px), а всё, что длиннее, прокручивается. Предел живёт на **вьюпорте**
 * скролла, а не на рамке: `max-h` на самой рамке обрезал бы текст без прокрутки (высота вьюпорта
 * в контейнере с `auto`-высотой не определена).
 */
export default {
  hints_root: 'relative w-full max-w-720 text-18 leading-[1.2]',
  hints_glow:
    'from-info/25 via-violet/20 to-pink/25 blur-32 pointer-events-none absolute -inset-20 rounded-full bg-gradient-to-br',
  hints_frame:
    'rounded-6 from-info/40 to-pink/45 relative bg-gradient-to-br via-white/10 p-[2px] shadow-2xl',
  hints_body: 'rounded-5 bg-surface/95 backdrop-blur-16 flex items-start gap-14 px-20 py-14',

  hints_icon: 'size-22 shrink-0',
  hints_icon_hint: 'text-accent',
  hints_icon_wait: 'text-dim',
  hints_icon_danger: 'text-danger',

  hints_text: 'min-w-0',
  hints_text_hint: 'text-ink',
  hints_text_wait: 'text-dim',
  hints_text_danger: 'text-danger',

  /** Три строки: больше — скролл (см. шапку пресета). */
  hints_scroll: 'max-h-65',
};
