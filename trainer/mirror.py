"""Зеркало артефакта для бандла: JSON-артефакт → JS-модуль (`bot/play/qvalue-weights.js`).

Зачем отдельная утилита: обучение пишет и JSON, и зеркало, но если артефакт уже обучен и лежит в
`trainer/artifacts/`, вернуть его в игру нужно без повторного прогона (обучение детерминировано, но идёт
минутами: 8 эпох MLP на 175 тысячах точек — это четверть часа).

    python trainer/mirror.py --artifact=trainer/artifacts/mlp-q.json
"""

import argparse
import json
import os

HEADER = (
    "/**\n"
    " * Артефакт тренера (`trainer/README.md`) — зеркало JSON-артефакта из `trainer/artifacts/`.\n"
    " * Файл **перезаписывается** обучением: править руками нечего.\n"
    " */\n"
)


def parse_args():
    parser = argparse.ArgumentParser(description="Артефакт тренера (JSON) → зеркало для бандла")
    parser.add_argument("--artifact", required=True, help="JSON-артефакт из trainer/artifacts/")
    parser.add_argument("--js-out", default="bot/play/qvalue-weights.js", help="куда писать зеркало")
    return parser.parse_args()


def main():
    args = parse_args()
    with open(args.artifact, encoding="utf8") as handle:
        artifact = json.load(handle)

    os.makedirs(os.path.dirname(os.path.abspath(args.js_out)), exist_ok=True)
    with open(args.js_out, "w", encoding="utf8") as handle:
        handle.write(HEADER)
        handle.write("export default " + json.dumps(artifact, ensure_ascii=False) + ";\n")

    print(
        f"зеркало: {args.js_out} ({os.path.getsize(args.js_out) // 1024} КБ) "
        f"из {args.artifact} (вид {artifact.get('kind')})"
    )


if __name__ == "__main__":
    main()
