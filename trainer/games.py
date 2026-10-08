"""Поставщик партий: Python зовёт Node, движок играет и стримит JSONL.

Правила живут в JS (`shared/`, `server/content/`) и переписыванию не подлежат: вторая реализация игры
означала бы, что веса калибруются под другую игру. Поэтому тренер не симулирует — он **заказывает**
партии у движка и читает готовый контракт (`trainer/contract.py`).

    python trainer/games.py --games=2000 --policy=search --out=trainer/data/search.jsonl
    python trainer/games.py --games=20000 --policy=greedy --out=trainer/data/greedy.jsonl --workers=12

Дешёвая самоигра — жадная политика (3556 партий за 22 с в замерах §20), поиск как учитель дороже
(1500 партий за 14 минут), но именно он даёт мягкие цели политики для дистилляции.
"""

import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PROVIDER = os.path.join("bot", "learn", "export.js")


def parse_args():
    parser = argparse.ArgumentParser(description="Партии из движка в JSONL для тренера")
    parser.add_argument("--games", type=int, default=500)
    parser.add_argument("--policy", default="search", help="search | greedy | conditions | net")
    parser.add_argument("--policy-b", default=None, help="политика второй стороны (по умолчанию та же)")
    parser.add_argument("--heroes", default="", help="список через запятую; пусто — весь пул")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--from", dest="from_seed", type=int, default=1)
    parser.add_argument("--out", default=os.path.join("trainer", "data", "samples.jsonl"))
    parser.add_argument("--gzip", action="store_true", help="сжать вывод (.gz)")
    parser.add_argument("--keep-going", action="store_true", help="не падать на ошибке партии")
    return parser.parse_args()


def main():
    args = parse_args()
    out = args.out + (".gz" if args.gzip and not args.out.endswith(".gz") else "")
    os.makedirs(os.path.dirname(os.path.abspath(os.path.join(ROOT, out))), exist_ok=True)

    command = [
        "node",
        PROVIDER,
        f"--out={out}",
        f"--games={args.games}",
        f"--policy={args.policy}",
        f"--workers={args.workers}",
        f"--from={args.from_seed}",
    ]
    if args.policy_b:
        command.append(f"--policy-b={args.policy_b}")
    if args.heroes:
        command.append(f"--heroes={args.heroes}")
    if args.gzip:
        command.append("--gzip")

    print(" ".join(command), flush=True)
    result = subprocess.run(command, cwd=ROOT)
    if result.returncode != 0 and not args.keep_going:
        sys.exit(result.returncode)
    print(f"готово: {os.path.join(ROOT, out)}")
    print(f"проверка контракта: python trainer/train.py --data={out} --check")


if __name__ == "__main__":
    main()
