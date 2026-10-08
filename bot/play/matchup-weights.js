/**
 * Матрица матчапов — зеркало `bot/play/matchups.json` для бандла (в браузере нет `fs`).
 * Файл **перезаписывается** обучением (`node bot/learn/train.js`): править руками нечего.
 */
export default {
  "meta": {
    "games": 1500,
    "positions": 76692,
    "train": 61353,
    "holdout": 15339,
    "accuracy": 0.733,
    "features": 63,
    "policy": "search",
    "heroes": [
      "anubis",
      "dorothy",
      "ifrit",
      "medusa",
      "snow-queen",
      "tesla"
    ]
  },
  "pairs": {
    "anubis": {
      "vs": {
        "dorothy": {
          "constant": 7.042,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.379,
            "hand": 1.245,
            "deck": 0.749,
            "thinDeck": 0.093,
            "resource": 1.991,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 1.115,
            "rivalHand": 0.835,
            "sidekickHp": 0.719,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "ifrit": {
          "constant": 6.327,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.379,
            "hand": 1.245,
            "deck": 0.749,
            "thinDeck": 0.093,
            "resource": 1.991,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 1.115,
            "rivalHand": 0.835,
            "sidekickHp": 0.719,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "medusa": {
          "constant": 0.608,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.379,
            "hand": 1.245,
            "deck": 0.749,
            "thinDeck": 0.093,
            "resource": 1.991,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 1.115,
            "rivalHand": 0.835,
            "sidekickHp": 0.719,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "snow-queen": {
          "constant": 3.593,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.379,
            "hand": 1.245,
            "deck": 0.749,
            "thinDeck": 0.093,
            "resource": 1.991,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 1.115,
            "rivalHand": 0.835,
            "sidekickHp": 0.719,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "tesla": {
          "constant": -1.217,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.379,
            "hand": 1.245,
            "deck": 0.749,
            "thinDeck": 0.093,
            "resource": 1.991,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 1.115,
            "rivalHand": 0.835,
            "sidekickHp": 0.719,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    },
    "dorothy": {
      "vs": {
        "anubis": {
          "constant": -3.87,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 2.546,
            "hand": 1.502,
            "deck": 0.131,
            "thinDeck": 0.093,
            "resource": 3.396,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -2.978,
            "rivalHand": 0.835,
            "sidekickHp": -3.045,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "ifrit": {
          "constant": 0.634,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 2.546,
            "hand": 1.502,
            "deck": 0.131,
            "thinDeck": 0.093,
            "resource": 3.396,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -2.978,
            "rivalHand": 0.835,
            "sidekickHp": -3.045,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "medusa": {
          "constant": -5.084,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 2.546,
            "hand": 1.502,
            "deck": 0.131,
            "thinDeck": 0.093,
            "resource": 3.396,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -2.978,
            "rivalHand": 0.835,
            "sidekickHp": -3.045,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "snow-queen": {
          "constant": -2.099,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 2.546,
            "hand": 1.502,
            "deck": 0.131,
            "thinDeck": 0.093,
            "resource": 3.396,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -2.978,
            "rivalHand": 0.835,
            "sidekickHp": -3.045,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "tesla": {
          "constant": -6.909,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 2.546,
            "hand": 1.502,
            "deck": 0.131,
            "thinDeck": 0.093,
            "resource": 3.396,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -2.978,
            "rivalHand": 0.835,
            "sidekickHp": -3.045,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    },
    "ifrit": {
      "vs": {
        "anubis": {
          "constant": -4.12,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.211,
            "hand": 1.025,
            "deck": 0.666,
            "thinDeck": 0.093,
            "resource": 3.919,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.942,
            "rivalHand": 0.835,
            "sidekickHp": -1.724,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "dorothy": {
          "constant": 1.099,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.211,
            "hand": 1.025,
            "deck": 0.666,
            "thinDeck": 0.093,
            "resource": 3.919,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.942,
            "rivalHand": 0.835,
            "sidekickHp": -1.724,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "medusa": {
          "constant": -5.334,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.211,
            "hand": 1.025,
            "deck": 0.666,
            "thinDeck": 0.093,
            "resource": 3.919,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.942,
            "rivalHand": 0.835,
            "sidekickHp": -1.724,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "snow-queen": {
          "constant": -2.349,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.211,
            "hand": 1.025,
            "deck": 0.666,
            "thinDeck": 0.093,
            "resource": 3.919,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.942,
            "rivalHand": 0.835,
            "sidekickHp": -1.724,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "tesla": {
          "constant": -7.159,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 0.211,
            "hand": 1.025,
            "deck": 0.666,
            "thinDeck": 0.093,
            "resource": 3.919,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.942,
            "rivalHand": 0.835,
            "sidekickHp": -1.724,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    },
    "medusa": {
      "vs": {
        "anubis": {
          "constant": 0.592,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 1.835,
            "hand": 0.857,
            "deck": 0.796,
            "thinDeck": 0.093,
            "resource": 3.474,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 0.333,
            "rivalHand": 0.835,
            "sidekickHp": -1.39,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "dorothy": {
          "constant": 5.811,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 1.835,
            "hand": 0.857,
            "deck": 0.796,
            "thinDeck": 0.093,
            "resource": 3.474,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 0.333,
            "rivalHand": 0.835,
            "sidekickHp": -1.39,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "ifrit": {
          "constant": 5.096,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 1.835,
            "hand": 0.857,
            "deck": 0.796,
            "thinDeck": 0.093,
            "resource": 3.474,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 0.333,
            "rivalHand": 0.835,
            "sidekickHp": -1.39,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "snow-queen": {
          "constant": 2.363,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 1.835,
            "hand": 0.857,
            "deck": 0.796,
            "thinDeck": 0.093,
            "resource": 3.474,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 0.333,
            "rivalHand": 0.835,
            "sidekickHp": -1.39,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "tesla": {
          "constant": -2.448,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": 1.835,
            "hand": 0.857,
            "deck": 0.796,
            "thinDeck": 0.093,
            "resource": 3.474,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 0.333,
            "rivalHand": 0.835,
            "sidekickHp": -1.39,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    },
    "snow-queen": {
      "vs": {
        "anubis": {
          "constant": -2.783,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -1.638,
            "hand": 0.514,
            "deck": 1.166,
            "thinDeck": 0.093,
            "resource": 4.147,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.048,
            "rivalHand": 0.835,
            "sidekickHp": -3.499,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "dorothy": {
          "constant": 2.436,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -1.638,
            "hand": 0.514,
            "deck": 1.166,
            "thinDeck": 0.093,
            "resource": 4.147,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.048,
            "rivalHand": 0.835,
            "sidekickHp": -3.499,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "ifrit": {
          "constant": 1.721,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -1.638,
            "hand": 0.514,
            "deck": 1.166,
            "thinDeck": 0.093,
            "resource": 4.147,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.048,
            "rivalHand": 0.835,
            "sidekickHp": -3.499,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "medusa": {
          "constant": -3.997,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -1.638,
            "hand": 0.514,
            "deck": 1.166,
            "thinDeck": 0.093,
            "resource": 4.147,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.048,
            "rivalHand": 0.835,
            "sidekickHp": -3.499,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "tesla": {
          "constant": -5.822,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -1.638,
            "hand": 0.514,
            "deck": 1.166,
            "thinDeck": 0.093,
            "resource": 4.147,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": -1.048,
            "rivalHand": 0.835,
            "sidekickHp": -3.499,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    },
    "tesla": {
      "vs": {
        "anubis": {
          "constant": 2.857,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -0.381,
            "hand": -0.071,
            "deck": 1.177,
            "thinDeck": 0.093,
            "resource": 3.469,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 2.729,
            "rivalHand": 0.835,
            "sidekickHp": -1.338,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "dorothy": {
          "constant": 8.076,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -0.381,
            "hand": -0.071,
            "deck": 1.177,
            "thinDeck": 0.093,
            "resource": 3.469,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 2.729,
            "rivalHand": 0.835,
            "sidekickHp": -1.338,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "ifrit": {
          "constant": 7.361,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -0.381,
            "hand": -0.071,
            "deck": 1.177,
            "thinDeck": 0.093,
            "resource": 3.469,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 2.729,
            "rivalHand": 0.835,
            "sidekickHp": -1.338,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "medusa": {
          "constant": 1.643,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -0.381,
            "hand": -0.071,
            "deck": 1.177,
            "thinDeck": 0.093,
            "resource": 3.469,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 2.729,
            "rivalHand": 0.835,
            "sidekickHp": -1.338,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        },
        "snow-queen": {
          "constant": 4.628,
          "weights": {
            "heroHp": 5.454,
            "teamHp": 1.084,
            "fighters": -0.381,
            "hand": -0.071,
            "deck": 1.177,
            "thinDeck": 0.093,
            "resource": 3.469,
            "resourceOn": 1.963,
            "fuel": 1.436,
            "stillness": 2.729,
            "rivalHand": 0.835,
            "sidekickHp": -1.338,
            "frozen": 0.067,
            "handLimit": 0.001,
            "round": 0.231
          }
        }
      }
    }
  }
};
