import type { Diagnostic, FlowDetail, FlowSummary } from "../api/types.js"

export const fixtureFlows: FlowSummary[] = [
  {
    "id": "broken_example",
    "version": 1,
    "file": "src/broken.flow.ts",
    "nodes": 0,
    "status": "fail"
  },
  {
    "id": "hotel_pitch",
    "version": 7,
    "file": "src/hotel_pitch.flow.ts",
    "nodes": 9,
    "status": "ok",
    "irHash": "198f8c3e"
  }
]

export const fixtureDetails: Record<string, FlowDetail> = {
  "hotel_pitch": {
    "ir": {
      "flow": "hotel_pitch",
      "version": 7,
      "input": "TourRequest",
      "output": {
        "type": "PitchText",
        "from": "$render.out"
      },
      "context": [
        "date",
        "locale"
      ],
      "budget": {
        "usdMicros": 400000,
        "seconds": 120,
        "tokens": null
      },
      "policies": {
        "visibility": {
          "divergeBranches": "isolated",
          "judgeSeesProvenance": false
        },
        "trust": {
          "defaultIn": "trusted"
        },
        "pii": {
          "maskInTraces": true,
          "allowlistProfile": "pii_safe"
        },
        "escalation": {
          "role": "manager"
        }
      },
      "defaults": {
        "retry": {
          "attempts": 2,
          "backoff": "exponential",
          "baseDelayMs": 500,
          "jitter": "full",
          "retryOn": [
            "timeout",
            "rate_limit",
            "server_error"
          ]
        },
        "timeoutMs": 60000
      },
      "components": {
        "pitch_gen": {
          "name": "pitch_gen",
          "out": {
            "type": "Pitch",
            "from": "$gen.out"
          },
          "nodes": {
            "gen": {
              "kind": "llm",
              "description": "Генерация питча по трём отелям",
              "fn": "pitch_gen",
              "modelRole": "writer",
              "overrides": {
                "maxOutputTokens": 1200
              },
              "trustIn": "trusted",
              "allowedSets": [
                {
                  "type": "FeatureId",
                  "from": "$in.hotels[*].features[*].id"
                }
              ],
              "outputContract": {
                "mode": "strict",
                "maxRepairs": 1,
                "onTruncated": "fail",
                "onRefusal": "fail"
              },
              "in": {
                "hotels": "$in.hotels",
                "request": "$in.request"
              }
            }
          }
        }
      },
      "nodes": {
        "load_hotels": {
          "kind": "tool",
          "description": "Отели по фильтрам заявки",
          "tool": "hotelsByFilters",
          "effect": "read",
          "ttlSeconds": 3600,
          "timeoutMs": 10000,
          "out": "Hotel[]",
          "in": {
            "filters": "$input.filters"
          }
        },
        "score_hotels": {
          "kind": "map",
          "over": "$load_hotels.out",
          "itemType": "Hotel",
          "concurrency": 8,
          "onItemError": "skip",
          "maxItems": 200,
          "budget": {
            "usdMicros": 80000
          },
          "do": {
            "kind": "llm",
            "fn": "score_hotel",
            "modelRole": "small_fast",
            "overrides": {
              "seed": 7,
              "maxOutputTokens": 400
            },
            "outputContract": {
              "mode": "strict",
              "maxRepairs": 1,
              "onTruncated": "fail",
              "onRefusal": "fail"
            },
            "trustIn": "trusted",
            "in": {
              "hotel": "$item",
              "request": "$input"
            }
          }
        },
        "top3": {
          "kind": "code",
          "description": "Топ-3 отеля по оценкам",
          "fn": "pickTopK",
          "pure": true,
          "timeoutMs": 5000,
          "out": "Hotel[]",
          "in": {
            "scores": "$score_hotels.out",
            "hotels": "$load_hotels.out",
            "k": {
              "const": 3
            }
          }
        },
        "pitches": {
          "kind": "call",
          "description": "Три питча с разной температурой",
          "component": "diverge",
          "typeArgs": [
            "Pitch"
          ],
          "params": {
            "body": {
              "component": "pitch_gen"
            }
          },
          "out": {
            "name": "Pitch[]"
          },
          "in": {
            "hotels": "$top3.out",
            "request": "$input",
            "n": {
              "const": 3
            },
            "vary": {
              "const": {
                "temperature": [
                  0.4,
                  0.8,
                  1.1
                ]
              }
            }
          }
        },
        "pick": {
          "kind": "call",
          "description": "Попарное сравнение с перестановкой позиций",
          "component": "judge",
          "typeArgs": [
            "Pitch"
          ],
          "out": {
            "name": "PitchVerdict"
          },
          "in": {
            "candidates": "$pitches.out",
            "request": "$input",
            "mode": {
              "const": "pairwise"
            },
            "swapPositions": {
              "const": true
            },
            "modelRole": {
              "const": "judge_strong"
            }
          }
        },
        "fix": {
          "kind": "call",
          "description": "Критика и правка до порога оценки",
          "component": "critic_loop",
          "typeArgs": [
            "Pitch"
          ],
          "out": {
            "name": "Pitch"
          },
          "budget": {
            "usdMicros": 100000
          },
          "in": {
            "pitch": "$pick.out.best",
            "request": "$input",
            "maxIter": {
              "const": 2
            },
            "threshold": {
              "const": 0.8
            },
            "select": {
              "const": "best"
            },
            "modelRole": {
              "const": "writer"
            }
          }
        },
        "review": {
          "kind": "human",
          "description": "Ручной разбор конфликта фактов",
          "form": "PitchReviewForm",
          "timeoutSeconds": 86400,
          "onTimeout": "escalate",
          "out": "Pitch",
          "in": {
            "pitch": "$pick.out.best",
            "verdict": "$pick.out"
          }
        },
        "final_pitch": {
          "kind": "switch",
          "description": "Решение судьи",
          "on": "$pick.out.decision",
          "onType": "PitchDecision",
          "default": null,
          "cases": {
            "accept": "$pick.out.best",
            "revise": {
              "node": "fix"
            },
            "escalate": {
              "node": "review"
            }
          }
        },
        "render": {
          "kind": "code",
          "description": "Подстановка фактов отелей по FeatureId",
          "fn": "renderPitch",
          "pure": true,
          "timeoutMs": 5000,
          "out": "PitchText",
          "in": {
            "pitch": "$final_pitch.out",
            "hotels": "$load_hotels.out"
          }
        }
      }
    },
    "synthMs": 31
  }
}

export const fixtureDiagnostics: Record<string, Diagnostic[]> = {
  "broken_example": [
    {
      "code": "WF_UNREGISTERED_NODE",
      "message": "ссылка указывает на узел «loaded», которого нет в списке nodes",
      "nodeId": "loaded"
    }
  ],
  "hotel_pitch": []
}
