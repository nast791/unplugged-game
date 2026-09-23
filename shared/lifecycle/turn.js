import { hasMoment, isHandOverLimit } from '#shared/helpers/turn.js';
import attack from '#shared/phases/attack.js';
import choose from '#shared/phases/choose.js';
import defense from '#shared/phases/defense.js';
import handLimit from '#shared/phases/handLimit.js';
import movement from '#shared/phases/movement.js';
import waiting from '#shared/phases/waiting.js';

export default {
  name: 'turn',
  phases: [handLimit, choose, movement, attack, defense, waiting],

  enter: partyState => {
    if (partyState._enteredHooks?.turn) return partyState;
    return {
      ...partyState,
      movement: null,
      combat: null,
      targeting: null,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turn: true },
    };
  },

  body: partyState =>
    (Number(partyState.turn?.actionsLeft) || 0) <= 0 &&
    !hasMoment(partyState) &&
    !isHandOverLimit(partyState, partyState.turn?.playerId),

  exit: partyState => {
    const state = {
      ...partyState,
      movement: null,
      combat: null,
      targeting: null,
      _enteredHooks: { ...(partyState._enteredHooks ?? {}), turn: false },
    };
    for (const player of state.players ?? []) {
      if (player._activePhase) player._activePhase = null;
    }
    return state;
  },
};

/*
 Хук 3: ход игрока (turn). Вход — из turnStart, выход — в turnEnd (или в gameEnd, если бой добил партию).

 1. Ход — это N действий (turn.actionsTotal, по умолчанию rules.actionsPerTurn; количество меняют карты и
    способности). Действие объявляется и сразу списывает 1 действие (SET_ACTIONS, delta −1): «в долг»
    нельзя, прервать объявленное действие нельзя. Виды действий — перемещение, атака, эффект-карта;
    комбинации любые (два перемещения подряд, две атаки, два эффекта), лимитов на бойцов нет.
 2. Промтов нет: всё делается кликами (PICK), подсказки выводятся сверху экрана. Смысл клика определяют
    текущие условия (какая фаза активна и какой момент в работе), а не отдельный тип действия клиента.
 3. Права на действие даёт активная фаза: core выбирает на игрока первую фазу с active === true и разрешает
    только move из её allow-list. У остальных игроков фазы нет — core сам отклонит их клик; отдельные
    assertTurn / assertPending не нужны. Поэтому фаз ровно столько, сколько бывает моментов хода.
 4. Фазы (брики) и приоритет — hook.phases: handLimit → choose → movement → attack → defense → waiting.
    - handLimit — конец хода: действий не осталось, а рука сверх rules.maxHandSize; сброс кликами по картам.
    - choose — объявление действия: колода (перемещение), attack|hybrid (атака), effect (эффект). Здесь же
      клик по кандидату бесплатной способности героя: способность не тратит действие и считается
      пропущенной, если игрок начал любое действие.
    - movement — объявленное перемещение: подсветка клеток выбранного бойца, шаги, одно усиление.
    - attack — я атакующий: выбор атакующего, подсветка целей, затем ожидание защиты.
    - defense — я защитник: карта в слот защиты или пас (защита 0).
    - waiting — я не действую: подсказка «ждём перемещения бойцов» или «ход игрока N», ходов нет.
    Отдельной фазы effect нет: эффект-карта разыгрывается внутри клика, а интерактив выражается через targeting.
 5. Полей-«ожиданий» нет. Есть поля текущего момента и facts-условия; движок идёт дальше только тогда,
    когда условие выполнено.
    - movement { playerId, origins, bonus, bonusUsed } — черновик перемещения; origins фиксирует старт бойца.
    - combat { stage, attackerPlayerId, defenderPlayerId, attackerFighterId, targetFighterId, attackCard,
      defenseCard, attackValue, defenseValue } — бой.
    - targeting { playerId, source, candidates, required } — выбор цели (бывший legacy effectPrompt).
    - lastCombat / lastBonus — итоги последнего действия для UI и лога; снимаются, когда объявляется
      следующее действие (SET_ACTIONS −1), поэтому результат боя виден и после передачи хода.
    Поля handDiscard нет: лимит руки — это факт HAND_OVER_LIMIT.
 6. Перемещение. Клик по колоде: −1 действие, открыть movement, добор 1 карты (колода пуста — 2 урона всем
    своим героям, помощникам урона нет; перемещение всё равно доступно). Дальше можно двигать любое число
    своих бойцов по их подсвеченным клеткам (радиус fighter.move + movement.bonus, занятые клетки заняты,
    проход сквозь своих — rules.canPassThroughTeammates), вернуться в начало радиуса можно. Усиление одно за
    действие: клик по карте с bonus → карта в сброс, бонус действует на всё действие целиком (movement.bonusUsed),
    после этого карты дизейблятся. Карты без bonus дизейблятся сразу. Кнопка «закончить действие» закрывает момент.
 7. Атака. Клик по playable attack|hybrid: карта уходит в закрытую в центр, −1 действие, stage = 'attacker'.
    Если карту могут применить несколько своих бойцов — подсветка кандидатов и выбор кликом (красная рамка);
    если кандидат один или карта привязана к бойцу — выбирается сам. Дальше подсвечиваются враги в радиусе
    выбранного бойца (BFS по neighbors, fighter.attackRange), клик по врагу → stage = 'defense'.
    Карты, которыми никто не достаёт врага, недоступны; отметка о недоступности видна только владельцу.
 8. Защита и бой. У защитника подсказка «ожидание защиты». Он либо кладёт defense|hybrid в слот, либо жмёт
    «закончить действие» — пас, защита 0. После подтверждения карты вскрываются (карту атаки защитник видит
    только теперь), дальше порядок: эффекты «мгновенно» / «во время битвы» (сначала защитник, потом
    атакующий; здесь же окно усиления атаки сбросом карты) → числа max(0, attackValue − defenseValue) →
    урон по цели → эффекты «после битвы» → combat закрыт. Боец с 0 HP убирается с поля; ≤1 живой стороны
    (FFA — по героям) → gameEnd. Победил атакующий, если боевой урон больше 0, иначе защитник; lastCombat —
    для UI и лога. Эффекты карт пока не реализованы: точки врезки те же, шаги — заглушки.
 9. Эффект-карта. Клик по playable effect: −1 действие, карта в сброс и открытая в центр, эффекты
    разыгрываются в том же клике. Если эффекту нужна цель — открывается targeting, выбор закрывается кликом
    по подсвеченному бойцу. Нужна ли цели карте — зависит от её эффекта (например «+1 действие» не требует).
 10. Конец хода. Ход закрывается, когда действий не осталось и моментов в работе нет. Если рука сверх
     лимита — сначала фаза handLimit, иначе сразу turnEnd. Кнопки «завершить ход» нет: закончить ход можно
     только отходив действия. Передача хода, round и actedRound — в turnStart, здесь не дублируются.
 11. Приватность. movement и его подсветка видны только владельцу: чужим вью во время действия позиции
     бойцов показываются по origins (бойцы «стоят на месте», подсказка «ждём перемещения бойцов»), после
     кнопки — актуальные (позже с анимацией). Карты боя пер-рольные: своя карта видна владельцу, после
     вскрытия — всем. Дизейбл карт считается в phase.ui на каждого зрителя, поэтому отметок оппонент не видит.
 12. Клик и экшены. Экшены — универсальные манипуляторы доменами: SET_ACTIONS, SET_CARDS, SET_HEALTH,
     SET_FIGHTER_CELL, SET_MOVEMENT, SET_COMBAT, SET_TARGETING, PICK, FINISH_ACTION. Клиент шлёт только PICK
     и FINISH_ACTION; что значит клик сейчас — решает фаза по условиям, а изменения делает экшен, поэтому
     карты и способности смогут вызывать те же кирпичи.
 13. Порядок работ: каркас → универсальные экшены и facts → choose + movement → attack → defense и бой →
     targeting → handLimit + turnEnd → UI и сервер → удаление legacy. Сделано всё: ход целиком на core,
     клиент ходит через runUi + PICK, сдача (RESIGN) подключена как общий move, legacy-экшены хода удалены
     (shared/actions остался мостом к движку карт до миграции эффектов). Регистрация в lifecycle/registry.js
     выполнена: core знает turnStart/turn/turnEnd, legacy обслуживает только gameEnd.
 14. TODO: эффекты карт и способности героев, RESIGN из любой фазы, team-mode (бить союзника нельзя,
     победа по командам), логгер хода и боя, анимация перемещения бойцов.
*/
