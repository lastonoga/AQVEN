import type { ApiNode, ApiNodeDetail, ApiPromptDetail } from "@/domain"

export const liveNodes: Readonly<Record<string, readonly ApiNode[]>> = {
  "support_case": [
    {
      "node_id": "prepare",
      "local_id": "prepare",
      "parent": null,
      "kind": "code",
      "path": "flows/support_case/nodes/prepare/prepare.node.yaml",
      "file_hash": "sha256-fb570108db483fcd0da975bd9d70d82c8b183f7b678fbd0f6be91afd7a7e936a",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/support_case/nodes/prepare/prepare.py:prepare",
      "problems_count": 0,
      "upstream": [],
      "downstream": [
        "drafts__gemini",
        "drafts__gpt",
        "drafts__mistral",
        "polish__revise",
        "record__extract",
        "triage",
        "vote"
      ]
    },
    {
      "node_id": "triage",
      "local_id": "triage",
      "parent": null,
      "kind": "llm",
      "path": "flows/support_case/nodes/triage/triage.node.yaml",
      "file_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e",
      "agent": "gemini",
      "inference": "triage",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare"
      ],
      "downstream": [
        "drafts__gemini",
        "drafts__gpt",
        "drafts__mistral",
        "illustrate",
        "intent__escalate",
        "panel",
        "polish__critique",
        "polish__revise",
        "record__extract",
        "route__resolve",
        "search_kb",
        "vote__ballot"
      ]
    },
    {
      "node_id": "vote",
      "local_id": "vote",
      "parent": null,
      "kind": "map",
      "path": "flows/support_case/nodes/vote/vote.node.yaml",
      "file_hash": "sha256-71d08645a7701a30876818ead07a0f6133fd3d9d261af7fab4be8ffe1c6d9444",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare",
        "vote__ballot"
      ],
      "downstream": [
        "tally"
      ]
    },
    {
      "node_id": "vote__ballot",
      "local_id": "ballot",
      "parent": "vote",
      "kind": "llm",
      "path": "flows/support_case/nodes/vote/ballot.node.yaml",
      "file_hash": "sha256-1bb2cf29e4d12f3d60f4e993a7b0f38450ec5aaac26512784f9c7a0d3277d5b0",
      "agent": "llama",
      "inference": "ballot",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "triage"
      ],
      "downstream": [
        "vote"
      ]
    },
    {
      "node_id": "tally",
      "local_id": "tally",
      "parent": null,
      "kind": "code",
      "path": "flows/support_case/nodes/tally/tally.node.yaml",
      "file_hash": "sha256-27065faeab27ac482f04bcdf21e3f24dce4367b614a65870b837cf36e00505b9",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/support_case/nodes/tally/tally.py:tally",
      "problems_count": 0,
      "upstream": [
        "vote"
      ],
      "downstream": [
        "intent"
      ]
    },
    {
      "node_id": "intent",
      "local_id": "intent",
      "parent": null,
      "kind": "switch",
      "path": "flows/support_case/nodes/intent/intent.node.yaml",
      "file_hash": "sha256-be5319527d521bb4592a5a18d53ab58f95f569aab0af0fbbb915bb1140b8a87d",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "intent__escalate",
        "tally"
      ],
      "downstream": [
        "case_form",
        "finalize"
      ]
    },
    {
      "node_id": "intent__escalate",
      "local_id": "escalate",
      "parent": "intent",
      "kind": "llm",
      "path": "flows/support_case/nodes/intent/escalate.node.yaml",
      "file_hash": "sha256-7872760a9f8faa55fbd0a5ba4d1fddd1e63237b553b513206f92db3ebe876d4b",
      "agent": "deepseek",
      "inference": "ballot",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "triage"
      ],
      "downstream": [
        "intent"
      ]
    },
    {
      "node_id": "case_form",
      "local_id": "case_form",
      "parent": null,
      "kind": "code",
      "path": "flows/support_case/nodes/case_form/case_form.node.yaml",
      "file_hash": "sha256-90576e9bc6179fe61310dd6573ea8e7b65128348dea415ebe7c9d6752f9f4d75",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/support_case/nodes/case_form/case_form.py:case_form",
      "problems_count": 0,
      "upstream": [
        "intent"
      ],
      "downstream": [
        "record__extract",
        "record__validate"
      ]
    },
    {
      "node_id": "record",
      "local_id": "record",
      "parent": null,
      "kind": "loop",
      "path": "flows/support_case/nodes/record/record.node.yaml",
      "file_hash": "sha256-5334e95a024a1f16910ad2f0f0f5076672c634434cad01d3d9ad9f35b2d91876",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "record__extract",
        "record__validate"
      ],
      "downstream": [
        "to_record"
      ]
    },
    {
      "node_id": "record__extract",
      "local_id": "extract",
      "parent": "record",
      "kind": "llm",
      "path": "flows/support_case/nodes/record/extract.node.yaml",
      "file_hash": "sha256-8731f49c57195682086c20fd0da5144b1f4adab7c3cf399a739412b08d94d095",
      "agent": "gemini",
      "inference": "extract",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "case_form",
        "prepare",
        "triage"
      ],
      "downstream": [
        "record",
        "record__validate"
      ]
    },
    {
      "node_id": "record__validate",
      "local_id": "validate",
      "parent": "record",
      "kind": "code",
      "path": "flows/support_case/nodes/record/validate.node.yaml",
      "file_hash": "sha256-04b0f0663ffce28aadd370588531a246ecea5f319dc26a5f03a5319c991737df",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/support_case/nodes/record/validate.py:validate_record",
      "problems_count": 0,
      "upstream": [
        "case_form",
        "record__extract"
      ],
      "downstream": [
        "record"
      ]
    },
    {
      "node_id": "to_record",
      "local_id": "to_record",
      "parent": null,
      "kind": "narrow",
      "path": "flows/support_case/nodes/to_record/to_record.node.yaml",
      "file_hash": "sha256-edd18b6f2e4d0ac0c694cc87ce9c2db40fae757283ef3120aaac1f643f083548",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "record"
      ],
      "downstream": [
        "finalize",
        "route"
      ]
    },
    {
      "node_id": "search_kb",
      "local_id": "search_kb",
      "parent": null,
      "kind": "tool",
      "path": "flows/support_case/nodes/search_kb/search_kb.node.yaml",
      "file_hash": "sha256-7baaee145191cab3bb53cf16e51982594c3bdabcfdf8abd8c43c86474c4d2aba",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "triage"
      ],
      "downstream": [
        "drafts__gemini",
        "drafts__gpt",
        "drafts__mistral",
        "panel",
        "polish__critique",
        "polish__revise",
        "route__resolve"
      ]
    },
    {
      "node_id": "route",
      "local_id": "route",
      "parent": null,
      "kind": "switch",
      "path": "flows/support_case/nodes/route/route.node.yaml",
      "file_hash": "sha256-8d8cc9abd4c2c5a766d6fb70351be723c93f092a05611228bffa19a98b5754bf",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "route__resolve",
        "to_record"
      ],
      "downstream": [
        "approvals__lead",
        "drafts__gemini",
        "drafts__gpt",
        "drafts__mistral",
        "finalize",
        "polish__critique",
        "polish__revise"
      ]
    },
    {
      "node_id": "route__resolve",
      "local_id": "resolve",
      "parent": "route",
      "kind": "llm",
      "path": "flows/support_case/nodes/route/resolve.node.yaml",
      "file_hash": "sha256-f302979b3b36c34e17375e5bf48459638d5e8ef3cc6350b20747a9d0de820f46",
      "agent": "resolver",
      "inference": "resolve",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "search_kb",
        "triage"
      ],
      "downstream": [
        "route"
      ]
    },
    {
      "node_id": "drafts",
      "local_id": "drafts",
      "parent": null,
      "kind": "parallel",
      "path": "flows/support_case/nodes/drafts/drafts.node.yaml",
      "file_hash": "sha256-d7194be6c4d80ada540971f669feb66c61cbbe06503f089535f55fb0d4747dd0",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "drafts__gemini",
        "drafts__gpt",
        "drafts__mistral"
      ],
      "downstream": [
        "panel"
      ]
    },
    {
      "node_id": "drafts__gemini",
      "local_id": "gemini",
      "parent": "drafts",
      "kind": "llm",
      "path": "flows/support_case/nodes/drafts/gemini.node.yaml",
      "file_hash": "sha256-caccd279f71b8fb5a7eff5875f71fe8775cf0d9cd0040205bacf87476fa8abcf",
      "agent": "gemini",
      "inference": "revise",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare",
        "route",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "drafts"
      ]
    },
    {
      "node_id": "drafts__gpt",
      "local_id": "gpt",
      "parent": "drafts",
      "kind": "llm",
      "path": "flows/support_case/nodes/drafts/gpt.node.yaml",
      "file_hash": "sha256-760f93cf6338d438ada145e99bf7b21f53a04c8f9cb571ed5b2cf3635480722e",
      "agent": "gpt",
      "inference": "revise",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare",
        "route",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "drafts"
      ]
    },
    {
      "node_id": "drafts__mistral",
      "local_id": "mistral",
      "parent": "drafts",
      "kind": "llm",
      "path": "flows/support_case/nodes/drafts/mistral.node.yaml",
      "file_hash": "sha256-a7edbeaf132d2070fde825ad82552025381b84ef49a4afb78955e1ac49323be6",
      "agent": "mistral",
      "inference": "revise",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare",
        "route",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "drafts"
      ]
    },
    {
      "node_id": "panel",
      "local_id": "panel",
      "parent": null,
      "kind": "call",
      "path": "flows/support_case/nodes/panel/panel.node.yaml",
      "file_hash": "sha256-cb4bc6eed572bac3e04735b1a54876ca517d804592e0c7d52f199c6512d92fbf",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "drafts",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "polish"
      ]
    },
    {
      "node_id": "polish",
      "local_id": "polish",
      "parent": null,
      "kind": "loop",
      "path": "flows/support_case/nodes/polish/polish.node.yaml",
      "file_hash": "sha256-ca0c70d1ebfcea7dd1c7d41c8f4512d0b09ce2b359bf9e8697d5b0cc1ac770a6",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "panel",
        "polish__critique",
        "polish__revise"
      ],
      "downstream": [
        "approvals__brand",
        "approvals__lead",
        "clip",
        "finalize",
        "illustrate",
        "voice"
      ]
    },
    {
      "node_id": "polish__critique",
      "local_id": "critique",
      "parent": "polish",
      "kind": "llm",
      "path": "flows/support_case/nodes/polish/critique.node.yaml",
      "file_hash": "sha256-b91d60ec112e78ae4632ec2afcab66ef91c3caad4a5cfdf33ef2f1dfc90345b0",
      "agent": "mistral",
      "inference": "critique",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "polish__revise",
        "route",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "polish"
      ]
    },
    {
      "node_id": "polish__revise",
      "local_id": "revise",
      "parent": "polish",
      "kind": "llm",
      "path": "flows/support_case/nodes/polish/revise.node.yaml",
      "file_hash": "sha256-fa6a367b5d267159998dea1887cf0e9ca9159b67b403fe5b072d5a63a5b0c012",
      "agent": "gpt",
      "inference": "revise",
      "prompt_level": 2,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "prepare",
        "route",
        "search_kb",
        "triage"
      ],
      "downstream": [
        "polish",
        "polish__critique"
      ]
    },
    {
      "node_id": "illustrate",
      "local_id": "illustrate",
      "parent": null,
      "kind": "llm",
      "path": "flows/support_case/nodes/illustrate/illustrate.node.yaml",
      "file_hash": "sha256-777c77ad19d3aad96878062c9c6f5450e5bfb68c5034d22d7941ec74377ffa6f",
      "agent": "painter",
      "inference": "illustrate",
      "prompt_level": 3,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "polish",
        "triage"
      ],
      "downstream": [
        "approvals__brand",
        "clip",
        "finalize"
      ]
    },
    {
      "node_id": "voice",
      "local_id": "voice",
      "parent": null,
      "kind": "tool",
      "path": "flows/support_case/nodes/voice/voice.node.yaml",
      "file_hash": "sha256-87dd43f80f97c86eeacd5c0299b5130ed0d2a15ddda773f645aa625e8e2d8e97",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "polish"
      ],
      "downstream": [
        "approvals__brand",
        "finalize"
      ]
    },
    {
      "node_id": "clip",
      "local_id": "clip",
      "parent": null,
      "kind": "tool",
      "path": "flows/support_case/nodes/clip/clip.node.yaml",
      "file_hash": "sha256-d3bcea188e861cc352b99278500878df24a18771870d196b5e3082b1dbf7e930",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "illustrate",
        "polish"
      ],
      "downstream": [
        "approvals__brand",
        "finalize"
      ]
    },
    {
      "node_id": "approvals",
      "local_id": "approvals",
      "parent": null,
      "kind": "parallel",
      "path": "flows/support_case/nodes/approvals/approvals.node.yaml",
      "file_hash": "sha256-b8f395ac82baeafe8142244cdd0cc2e2ac06a9e76ef82683595f2f8570eed173",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "approvals__brand",
        "approvals__lead"
      ],
      "downstream": [
        "finalize"
      ]
    },
    {
      "node_id": "approvals__brand",
      "local_id": "brand",
      "parent": "approvals",
      "kind": "human",
      "path": "flows/support_case/nodes/approvals/brand.node.yaml",
      "file_hash": "sha256-aed3e2b05fb07d76622275721511b35321bc6b916e061fd93fad1d5701db9a44",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "clip",
        "illustrate",
        "polish",
        "voice"
      ],
      "downstream": [
        "approvals"
      ]
    },
    {
      "node_id": "approvals__lead",
      "local_id": "lead",
      "parent": "approvals",
      "kind": "human",
      "path": "flows/support_case/nodes/approvals/lead.node.yaml",
      "file_hash": "sha256-4f0b1c0b4eb42cccd95daaf22d9b5fda711aaa8133502a5aa0ed7a5e39ab5654",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "polish",
        "route"
      ],
      "downstream": [
        "approvals"
      ]
    },
    {
      "node_id": "finalize",
      "local_id": "finalize",
      "parent": null,
      "kind": "code",
      "path": "flows/support_case/nodes/finalize/finalize.node.yaml",
      "file_hash": "sha256-bb012d748e560afe2b07ee8f1c5f81d5b8662621d275c69d0c4d3016ced9e4b7",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/support_case/nodes/finalize/finalize.py:finalize",
      "problems_count": 0,
      "upstream": [
        "approvals",
        "clip",
        "illustrate",
        "intent",
        "polish",
        "route",
        "to_record",
        "voice"
      ],
      "downstream": []
    }
  ],
  "judge_panel": [
    {
      "node_id": "judges",
      "local_id": "judges",
      "parent": null,
      "kind": "parallel",
      "path": "flows/judge_panel/nodes/judges/judges.node.yaml",
      "file_hash": "sha256-b3308f7dff98724a5b43329557f231cb8644dfb8c2756505f76570f21b47345e",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "judges__deepseek",
        "judges__llama",
        "judges__qwen"
      ],
      "downstream": [
        "aggregate",
        "decide__tie_break"
      ]
    },
    {
      "node_id": "judges__deepseek",
      "local_id": "deepseek",
      "parent": "judges",
      "kind": "llm",
      "path": "flows/judge_panel/nodes/judges/deepseek.node.yaml",
      "file_hash": "sha256-2f3a0976c6904c5f1984fd312fad2eaa6f6729b81bb3c15045eb8f0436ee6a8a",
      "agent": "deepseek",
      "inference": "tie_break",
      "prompt_level": 1,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [],
      "downstream": [
        "judges"
      ]
    },
    {
      "node_id": "judges__llama",
      "local_id": "llama",
      "parent": "judges",
      "kind": "llm",
      "path": "flows/judge_panel/nodes/judges/llama.node.yaml",
      "file_hash": "sha256-fcfebea38f135ccf937ecb6e104f725dbabf01aa070d351ea9bf09681433d81c",
      "agent": "llama",
      "inference": "tie_break",
      "prompt_level": 1,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [],
      "downstream": [
        "judges"
      ]
    },
    {
      "node_id": "judges__qwen",
      "local_id": "qwen",
      "parent": "judges",
      "kind": "llm",
      "path": "flows/judge_panel/nodes/judges/qwen.node.yaml",
      "file_hash": "sha256-0007309b338a4ce082539dbd4ba9c4d3313f102f3c5973aa980d6715390e503b",
      "agent": "qwen",
      "inference": "tie_break",
      "prompt_level": 1,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [],
      "downstream": [
        "judges"
      ]
    },
    {
      "node_id": "aggregate",
      "local_id": "aggregate",
      "parent": null,
      "kind": "code",
      "path": "flows/judge_panel/nodes/aggregate/aggregate.node.yaml",
      "file_hash": "sha256-93b880494e96aa3dd8cea16bbac82dd7bd4d72e6d1f7052931e930a851337a05",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/judge_panel/nodes/aggregate/aggregate.py:aggregate",
      "problems_count": 0,
      "upstream": [
        "judges"
      ],
      "downstream": [
        "decide",
        "pick"
      ]
    },
    {
      "node_id": "decide",
      "local_id": "decide",
      "parent": null,
      "kind": "switch",
      "path": "flows/judge_panel/nodes/decide/decide.node.yaml",
      "file_hash": "sha256-589a2bc0409675d0e2ceeac1c201fae2e8d94682d4a4e666b40c1a70578be890",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "aggregate",
        "decide__tie_break"
      ],
      "downstream": [
        "pick"
      ]
    },
    {
      "node_id": "decide__tie_break",
      "local_id": "tie_break",
      "parent": "decide",
      "kind": "llm",
      "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml",
      "file_hash": "sha256-81fb8b71270ea35be4aa1ec967bc6c70d6bbc1eda4039e191f0ef250c0386482",
      "agent": "gpt",
      "inference": "tie_break",
      "prompt_level": 1,
      "code_ref": null,
      "problems_count": 0,
      "upstream": [
        "judges"
      ],
      "downstream": [
        "decide"
      ]
    },
    {
      "node_id": "pick",
      "local_id": "pick",
      "parent": null,
      "kind": "code",
      "path": "flows/judge_panel/nodes/pick/pick.node.yaml",
      "file_hash": "sha256-95b4e3e2f96a904f16c9072275facbd0ffcbdb84803ba97541637968dd1c2983",
      "agent": null,
      "inference": null,
      "prompt_level": null,
      "code_ref": "@root/flows/judge_panel/nodes/pick/pick.py:pick",
      "problems_count": 0,
      "upstream": [
        "aggregate",
        "decide"
      ],
      "downstream": []
    }
  ]
}

export const liveNodeDetails: Readonly<Record<string, ApiNodeDetail>> = {
  "support_case/prepare": {
    "node_id": "prepare",
    "local_id": "prepare",
    "parent": null,
    "kind": "code",
    "path": "flows/support_case/nodes/prepare/prepare.node.yaml",
    "file_hash": "sha256-fb570108db483fcd0da975bd9d70d82c8b183f7b678fbd0f6be91afd7a7e936a",
    "agent": null,
    "inference": null,
    "prompt_level": null,
    "code_ref": "@root/flows/support_case/nodes/prepare/prepare.py:prepare",
    "problems_count": 0,
    "upstream": [],
    "downstream": [
      "drafts__gemini",
      "drafts__gpt",
      "drafts__mistral",
      "polish__revise",
      "record__extract",
      "triage",
      "vote"
    ],
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Node",
      "node": "code",
      "description": "Normalizes the request text and derives the channel, the product category's signals, the marketplace intake fields and the voting perspectives",
      "limits": null,
      "run": "@root/flows/support_case/nodes/prepare/prepare.py:prepare",
      "in": [
        {
          "name": "request",
          "type": "CaseRequest",
          "description": "The customer's whole request",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "from": "$input",
          "value": null
        }
      ],
      "out": [
        {
          "name": "message",
          "type": "Text",
          "description": "Request text with normalized whitespace",
          "maxLength": 4000,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "schema_from": null,
          "limits": null
        },
        {
          "name": "channel",
          "type": "Channel",
          "description": "Channel the request came from",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "schema_from": null,
          "limits": null
        },
        {
          "name": "signals",
          "type": "SignalDef[]",
          "description": "Allowed observation signals for the product category",
          "maxLength": null,
          "maxItems": 20,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "schema_from": null,
          "limits": null
        },
        {
          "name": "intake_fields",
          "type": "FieldSpec[]",
          "description": "Intake fields the marketplace requires",
          "maxLength": null,
          "maxItems": 10,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "schema_from": null,
          "limits": null
        },
        {
          "name": "perspectives",
          "type": "VotePerspective[]",
          "description": "Perspectives of the independent votes on intent",
          "maxLength": null,
          "maxItems": 3,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "schema_from": null,
          "limits": null
        }
      ]
    },
    "ir_node": {
      "inputs": [
        {
          "kind": "ref",
          "name": "request",
          "ref": "$input"
        }
      ],
      "input_schema": {
        "$defs": {
          "Audio": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^audio/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "CaseOriginMarketplace": {
            "additionalProperties": false,
            "properties": {
              "kind": {
                "const": "marketplace",
                "description": "A request about a marketplace order",
                "type": "string"
              },
              "marketplace": {
                "description": "Marketplace of the order",
                "enum": [
                  "amazon",
                  "ozon"
                ],
                "type": "string"
              },
              "order_ref": {
                "description": "Order number on the marketplace",
                "maxLength": 40,
                "type": "string"
              }
            },
            "required": [
              "kind",
              "marketplace",
              "order_ref"
            ],
            "type": "object"
          },
          "CaseOriginStorefront": {
            "additionalProperties": false,
            "properties": {
              "kind": {
                "const": "storefront",
                "description": "Support form on the Lumen online store",
                "type": "string"
              },
              "page": {
                "description": "Storefront page the customer wrote from",
                "maxLength": 200,
                "type": "string"
              }
            },
            "required": [
              "kind",
              "page"
            ],
            "type": "object"
          },
          "CaseRequest": {
            "additionalProperties": false,
            "properties": {
              "customer": {
                "$ref": "#/$defs/Customer",
                "description": "The customer who wrote to support"
              },
              "origin": {
                "description": "Channel the request arrived through",
                "discriminator": {
                  "mapping": {
                    "marketplace": "#/$defs/CaseOriginMarketplace",
                    "storefront": "#/$defs/CaseOriginStorefront"
                  },
                  "propertyName": "kind"
                },
                "oneOf": [
                  {
                    "$ref": "#/$defs/CaseOriginStorefront"
                  },
                  {
                    "$ref": "#/$defs/CaseOriginMarketplace"
                  }
                ]
              },
              "message": {
                "description": "Text of the customer's request",
                "maxLength": 4000,
                "type": "string"
              },
              "order_id": {
                "anyOf": [
                  {
                    "pattern": "^LUM-[0-9]{8}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Lumen order number; null if the customer did not give one"
              },
              "product": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/ProductRef"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Product of the request; null if not identified"
              },
              "tags": {
                "description": "Request tags from the storefront or marketplace form",
                "items": {
                  "maxLength": 40,
                  "type": "string"
                },
                "maxItems": 5,
                "type": "array"
              },
              "urgent": {
                "description": "The customer marked the request as urgent",
                "type": "boolean"
              },
              "photo": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Image"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Photo of the defect or packaging; null if not attached"
              },
              "voice_note": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Audio"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "The customer's voice message; null if not attached"
              },
              "video": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Video"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Video of the defect; null if not attached"
              },
              "invoice": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Document"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Invoice or receipt; null if not attached"
              }
            },
            "required": [
              "customer",
              "origin",
              "message",
              "order_id",
              "product",
              "tags",
              "urgent",
              "photo",
              "voice_note",
              "video",
              "invoice"
            ],
            "type": "object"
          },
          "Customer": {
            "additionalProperties": false,
            "properties": {
              "customer_id": {
                "description": "Customer id in the CRM",
                "pattern": "^cus_[a-z0-9]{12}$",
                "type": "string"
              },
              "display_name": {
                "description": "The name the customer gave",
                "maxLength": 120,
                "type": "string"
              },
              "email": {
                "anyOf": [
                  {
                    "maxLength": 254,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Email address; null if the customer left none"
              },
              "tier": {
                "description": "Service tier",
                "enum": [
                  "standard",
                  "plus",
                  "business"
                ],
                "type": "string"
              },
              "locale": {
                "description": "Language and region for talking to the customer",
                "type": "string"
              }
            },
            "required": [
              "customer_id",
              "display_name",
              "email",
              "tier",
              "locale"
            ],
            "type": "object"
          },
          "Document": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^(application|text)/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "Image": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^image/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "ProductRef": {
            "additionalProperties": false,
            "properties": {
              "sku": {
                "description": "Product SKU",
                "pattern": "^SKU-[A-Z0-9]{6}$",
                "type": "string"
              },
              "name": {
                "description": "Product name in the catalog",
                "maxLength": 120,
                "type": "string"
              },
              "category": {
                "description": "Product category",
                "enum": [
                  "desk_lamp",
                  "floor_lamp",
                  "smart_bulb",
                  "light_strip",
                  "accessory"
                ],
                "type": "string"
              },
              "lamp_kind": {
                "anyOf": [
                  {
                    "enum": [
                      "mains",
                      "rechargeable",
                      "smart_wifi",
                      "smart_zigbee"
                    ],
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Lamp type; null for accessories without their own light"
              }
            },
            "required": [
              "sku",
              "name",
              "category",
              "lamp_kind"
            ],
            "type": "object"
          },
          "Video": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^video/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "request": {
            "$ref": "#/$defs/CaseRequest",
            "description": "The customer's whole request"
          }
        },
        "required": [
          "request"
        ],
        "type": "object"
      },
      "node_id": "prepare",
      "parent": null,
      "description": "Normalizes the request text and derives the channel, the product category's signals, the marketplace intake fields and the voting perspectives",
      "limits": null,
      "output_schema": {
        "$defs": {
          "FieldSpec": {
            "additionalProperties": false,
            "properties": {
              "name": {
                "pattern": "^[a-z][a-z0-9_]{0,62}$",
                "type": "string"
              },
              "type": {
                "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                "type": "string"
              },
              "description": {
                "maxLength": 300,
                "minLength": 1,
                "type": "string"
              },
              "maxLength": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maxItems": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "minimum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maximum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "pattern": {
                "anyOf": [
                  {
                    "maxLength": 500,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "enum": {
                "anyOf": [
                  {
                    "items": {
                      "type": "string"
                    },
                    "maxItems": 50,
                    "minItems": 1,
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "fields": {
                "anyOf": [
                  {
                    "items": {
                      "$ref": "#/$defs/FieldSpec"
                    },
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              }
            },
            "required": [
              "name",
              "type",
              "description"
            ],
            "type": "object"
          },
          "SignalDef": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "description": "Signal key",
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "label": {
                "description": "Signal name for the model and the operator",
                "maxLength": 80,
                "type": "string"
              }
            },
            "required": [
              "key",
              "label"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "message": {
            "description": "Request text with normalized whitespace",
            "maxLength": 4000,
            "type": "string"
          },
          "channel": {
            "description": "Channel the request came from",
            "enum": [
              "storefront",
              "amazon",
              "ozon"
            ],
            "type": "string"
          },
          "signals": {
            "description": "Allowed observation signals for the product category",
            "items": {
              "$ref": "#/$defs/SignalDef"
            },
            "maxItems": 20,
            "type": "array"
          },
          "intake_fields": {
            "description": "Intake fields the marketplace requires",
            "items": {
              "$ref": "#/$defs/FieldSpec"
            },
            "maxItems": 10,
            "type": "array"
          },
          "perspectives": {
            "description": "Perspectives of the independent votes on intent",
            "items": {
              "enum": [
                "words",
                "evidence",
                "risk"
              ],
              "type": "string"
            },
            "maxItems": 3,
            "type": "array"
          }
        },
        "required": [
          "message",
          "channel",
          "signals",
          "intake_fields",
          "perspectives"
        ],
        "type": "object"
      },
      "kind": "code",
      "run": "lumen.flows.support_case.nodes.prepare.prepare:prepare",
      "input_fields": [
        {
          "name": "request",
          "type": "CaseRequest",
          "description": "The customer's whole request"
        }
      ],
      "output_fields": [
        {
          "name": "message",
          "type": "Text",
          "description": "Request text with normalized whitespace"
        },
        {
          "name": "channel",
          "type": "Channel",
          "description": "Channel the request came from"
        },
        {
          "name": "signals",
          "type": "SignalDef[]",
          "description": "Allowed observation signals for the product category"
        },
        {
          "name": "intake_fields",
          "type": "FieldSpec[]",
          "description": "Intake fields the marketplace requires"
        },
        {
          "name": "perspectives",
          "type": "VotePerspective[]",
          "description": "Perspectives of the independent votes on intent"
        }
      ],
      "dynamic_outputs": []
    },
    "in_schema": {
      "additionalProperties": false,
      "properties": {
        "request": {
          "additionalProperties": false,
          "properties": {
            "customer": {
              "additionalProperties": false,
              "properties": {
                "customer_id": {
                  "pattern": "^cus_[a-z0-9]{12}$",
                  "type": "string"
                },
                "display_name": {
                  "maxLength": 120,
                  "type": "string"
                },
                "email": {
                  "anyOf": [
                    {
                      "maxLength": 254,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "tier": {
                  "enum": [
                    "standard",
                    "plus",
                    "business"
                  ],
                  "type": "string"
                },
                "locale": {
                  "type": "string"
                }
              },
              "required": [
                "customer_id",
                "display_name",
                "email",
                "tier",
                "locale"
              ],
              "type": "object"
            },
            "origin": {
              "oneOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "kind": {
                      "const": "storefront",
                      "type": "string"
                    },
                    "page": {
                      "maxLength": 200,
                      "type": "string"
                    }
                  },
                  "required": [
                    "kind",
                    "page"
                  ],
                  "type": "object"
                },
                {
                  "additionalProperties": false,
                  "properties": {
                    "kind": {
                      "const": "marketplace",
                      "type": "string"
                    },
                    "marketplace": {
                      "enum": [
                        "amazon",
                        "ozon"
                      ],
                      "type": "string"
                    },
                    "order_ref": {
                      "maxLength": 40,
                      "type": "string"
                    }
                  },
                  "required": [
                    "kind",
                    "marketplace",
                    "order_ref"
                  ],
                  "type": "object"
                }
              ]
            },
            "message": {
              "maxLength": 4000,
              "type": "string"
            },
            "order_id": {
              "anyOf": [
                {
                  "pattern": "^LUM-[0-9]{8}$",
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "product": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "sku": {
                      "pattern": "^SKU-[A-Z0-9]{6}$",
                      "type": "string"
                    },
                    "name": {
                      "maxLength": 120,
                      "type": "string"
                    },
                    "category": {
                      "enum": [
                        "desk_lamp",
                        "floor_lamp",
                        "smart_bulb",
                        "light_strip",
                        "accessory"
                      ],
                      "type": "string"
                    },
                    "lamp_kind": {
                      "anyOf": [
                        {
                          "enum": [
                            "mains",
                            "rechargeable",
                            "smart_wifi",
                            "smart_zigbee"
                          ],
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    }
                  },
                  "required": [
                    "sku",
                    "name",
                    "category",
                    "lamp_kind"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            },
            "tags": {
              "items": {
                "maxLength": 40,
                "type": "string"
              },
              "maxItems": 5,
              "type": "array"
            },
            "urgent": {
              "type": "boolean"
            },
            "photo": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "$media": {
                      "maxLength": 255,
                      "pattern": "^image/[a-z0-9.+-]+$",
                      "type": "string"
                    },
                    "blob_id": {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    "size_bytes": {
                      "minimum": 0,
                      "type": "integer"
                    },
                    "name": {
                      "anyOf": [
                        {
                          "maxLength": 255,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "url": {
                      "anyOf": [
                        {
                          "maxLength": 2048,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "poster_blob_id": {
                      "anyOf": [
                        {
                          "pattern": "^sha256-[0-9a-f]{64}$",
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "note": {
                      "anyOf": [
                        {
                          "maxLength": 1000,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    }
                  },
                  "required": [
                    "$media",
                    "blob_id",
                    "size_bytes",
                    "name"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            },
            "voice_note": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "$media": {
                      "maxLength": 255,
                      "pattern": "^audio/[a-z0-9.+-]+$",
                      "type": "string"
                    },
                    "blob_id": {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    "size_bytes": {
                      "minimum": 0,
                      "type": "integer"
                    },
                    "name": {
                      "anyOf": [
                        {
                          "maxLength": 255,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "url": {
                      "anyOf": [
                        {
                          "maxLength": 2048,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "poster_blob_id": {
                      "anyOf": [
                        {
                          "pattern": "^sha256-[0-9a-f]{64}$",
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "note": {
                      "anyOf": [
                        {
                          "maxLength": 1000,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    }
                  },
                  "required": [
                    "$media",
                    "blob_id",
                    "size_bytes",
                    "name"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            },
            "video": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "$media": {
                      "maxLength": 255,
                      "pattern": "^video/[a-z0-9.+-]+$",
                      "type": "string"
                    },
                    "blob_id": {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    "size_bytes": {
                      "minimum": 0,
                      "type": "integer"
                    },
                    "name": {
                      "anyOf": [
                        {
                          "maxLength": 255,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "url": {
                      "anyOf": [
                        {
                          "maxLength": 2048,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "poster_blob_id": {
                      "anyOf": [
                        {
                          "pattern": "^sha256-[0-9a-f]{64}$",
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "note": {
                      "anyOf": [
                        {
                          "maxLength": 1000,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    }
                  },
                  "required": [
                    "$media",
                    "blob_id",
                    "size_bytes",
                    "name"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            },
            "invoice": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "$media": {
                      "maxLength": 255,
                      "pattern": "^(application|text)/[a-z0-9.+-]+$",
                      "type": "string"
                    },
                    "blob_id": {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    "size_bytes": {
                      "minimum": 0,
                      "type": "integer"
                    },
                    "name": {
                      "anyOf": [
                        {
                          "maxLength": 255,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ]
                    },
                    "url": {
                      "anyOf": [
                        {
                          "maxLength": 2048,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "poster_blob_id": {
                      "anyOf": [
                        {
                          "pattern": "^sha256-[0-9a-f]{64}$",
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    },
                    "note": {
                      "anyOf": [
                        {
                          "maxLength": 1000,
                          "type": "string"
                        },
                        {
                          "type": "null"
                        }
                      ],
                      "readOnly": true
                    }
                  },
                  "required": [
                    "$media",
                    "blob_id",
                    "size_bytes",
                    "name"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "required": [
            "customer",
            "origin",
            "message",
            "order_id",
            "product",
            "tags",
            "urgent",
            "photo",
            "voice_note",
            "video",
            "invoice"
          ],
          "type": "object"
        }
      },
      "required": [
        "request"
      ],
      "type": "object"
    },
    "out_schema": {
      "additionalProperties": false,
      "properties": {
        "message": {
          "maxLength": 4000,
          "type": "string"
        },
        "channel": {
          "enum": [
            "storefront",
            "amazon",
            "ozon"
          ],
          "type": "string"
        },
        "signals": {
          "items": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "label": {
                "maxLength": 80,
                "type": "string"
              }
            },
            "required": [
              "key",
              "label"
            ],
            "type": "object"
          },
          "maxItems": 20,
          "type": "array"
        },
        "intake_fields": {
          "items": {
            "additionalProperties": false,
            "properties": {
              "name": {
                "pattern": "^[a-z][a-z0-9_]{0,62}$",
                "type": "string"
              },
              "type": {
                "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                "type": "string"
              },
              "description": {
                "maxLength": 300,
                "minLength": 1,
                "type": "string"
              },
              "maxLength": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "maxItems": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "minimum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "maximum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "pattern": {
                "anyOf": [
                  {
                    "maxLength": 500,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "enum": {
                "anyOf": [
                  {
                    "items": {
                      "type": "string"
                    },
                    "maxItems": 50,
                    "minItems": 1,
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fields": {
                "anyOf": [
                  {
                    "items": {
                      "$ref": "FieldSpec"
                    },
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "name",
              "type",
              "description"
            ],
            "type": "object"
          },
          "maxItems": 10,
          "type": "array"
        },
        "perspectives": {
          "items": {
            "enum": [
              "words",
              "evidence",
              "risk"
            ],
            "type": "string"
          },
          "maxItems": 3,
          "type": "array"
        }
      },
      "required": [
        "message",
        "channel",
        "signals",
        "intake_fields",
        "perspectives"
      ],
      "type": "object"
    },
    "form_schema": null,
    "bindings": [
      {
        "slot": "request",
        "ref": "$input",
        "value": null
      }
    ],
    "prompt": null,
    "code": {
      "ref": "@root/flows/support_case/nodes/prepare/prepare.py:prepare",
      "declared_in": {
        "additionalProperties": false,
        "properties": {
          "request": {
            "additionalProperties": false,
            "properties": {
              "customer": {
                "additionalProperties": false,
                "properties": {
                  "customer_id": {
                    "pattern": "^cus_[a-z0-9]{12}$",
                    "type": "string"
                  },
                  "display_name": {
                    "maxLength": 120,
                    "type": "string"
                  },
                  "email": {
                    "anyOf": [
                      {
                        "maxLength": 254,
                        "type": "string"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "tier": {
                    "enum": [
                      "standard",
                      "plus",
                      "business"
                    ],
                    "type": "string"
                  },
                  "locale": {
                    "type": "string"
                  }
                },
                "required": [
                  "customer_id",
                  "display_name",
                  "email",
                  "tier",
                  "locale"
                ],
                "type": "object"
              },
              "origin": {
                "oneOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "kind": {
                        "const": "storefront",
                        "type": "string"
                      },
                      "page": {
                        "maxLength": 200,
                        "type": "string"
                      }
                    },
                    "required": [
                      "kind",
                      "page"
                    ],
                    "type": "object"
                  },
                  {
                    "additionalProperties": false,
                    "properties": {
                      "kind": {
                        "const": "marketplace",
                        "type": "string"
                      },
                      "marketplace": {
                        "enum": [
                          "amazon",
                          "ozon"
                        ],
                        "type": "string"
                      },
                      "order_ref": {
                        "maxLength": 40,
                        "type": "string"
                      }
                    },
                    "required": [
                      "kind",
                      "marketplace",
                      "order_ref"
                    ],
                    "type": "object"
                  }
                ]
              },
              "message": {
                "maxLength": 4000,
                "type": "string"
              },
              "order_id": {
                "anyOf": [
                  {
                    "pattern": "^LUM-[0-9]{8}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "product": {
                "anyOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "sku": {
                        "pattern": "^SKU-[A-Z0-9]{6}$",
                        "type": "string"
                      },
                      "name": {
                        "maxLength": 120,
                        "type": "string"
                      },
                      "category": {
                        "enum": [
                          "desk_lamp",
                          "floor_lamp",
                          "smart_bulb",
                          "light_strip",
                          "accessory"
                        ],
                        "type": "string"
                      },
                      "lamp_kind": {
                        "anyOf": [
                          {
                            "enum": [
                              "mains",
                              "rechargeable",
                              "smart_wifi",
                              "smart_zigbee"
                            ],
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      }
                    },
                    "required": [
                      "sku",
                      "name",
                      "category",
                      "lamp_kind"
                    ],
                    "type": "object"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "tags": {
                "items": {
                  "maxLength": 40,
                  "type": "string"
                },
                "maxItems": 5,
                "type": "array"
              },
              "urgent": {
                "type": "boolean"
              },
              "photo": {
                "anyOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "$media": {
                        "maxLength": 255,
                        "pattern": "^image/[a-z0-9.+-]+$",
                        "type": "string"
                      },
                      "blob_id": {
                        "pattern": "^sha256-[0-9a-f]{64}$",
                        "type": "string"
                      },
                      "size_bytes": {
                        "minimum": 0,
                        "type": "integer"
                      },
                      "name": {
                        "anyOf": [
                          {
                            "maxLength": 255,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "url": {
                        "anyOf": [
                          {
                            "maxLength": 2048,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "poster_blob_id": {
                        "anyOf": [
                          {
                            "pattern": "^sha256-[0-9a-f]{64}$",
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "note": {
                        "anyOf": [
                          {
                            "maxLength": 1000,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      }
                    },
                    "required": [
                      "$media",
                      "blob_id",
                      "size_bytes",
                      "name"
                    ],
                    "type": "object"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "voice_note": {
                "anyOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "$media": {
                        "maxLength": 255,
                        "pattern": "^audio/[a-z0-9.+-]+$",
                        "type": "string"
                      },
                      "blob_id": {
                        "pattern": "^sha256-[0-9a-f]{64}$",
                        "type": "string"
                      },
                      "size_bytes": {
                        "minimum": 0,
                        "type": "integer"
                      },
                      "name": {
                        "anyOf": [
                          {
                            "maxLength": 255,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "url": {
                        "anyOf": [
                          {
                            "maxLength": 2048,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "poster_blob_id": {
                        "anyOf": [
                          {
                            "pattern": "^sha256-[0-9a-f]{64}$",
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "note": {
                        "anyOf": [
                          {
                            "maxLength": 1000,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      }
                    },
                    "required": [
                      "$media",
                      "blob_id",
                      "size_bytes",
                      "name"
                    ],
                    "type": "object"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "video": {
                "anyOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "$media": {
                        "maxLength": 255,
                        "pattern": "^video/[a-z0-9.+-]+$",
                        "type": "string"
                      },
                      "blob_id": {
                        "pattern": "^sha256-[0-9a-f]{64}$",
                        "type": "string"
                      },
                      "size_bytes": {
                        "minimum": 0,
                        "type": "integer"
                      },
                      "name": {
                        "anyOf": [
                          {
                            "maxLength": 255,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "url": {
                        "anyOf": [
                          {
                            "maxLength": 2048,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "poster_blob_id": {
                        "anyOf": [
                          {
                            "pattern": "^sha256-[0-9a-f]{64}$",
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "note": {
                        "anyOf": [
                          {
                            "maxLength": 1000,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      }
                    },
                    "required": [
                      "$media",
                      "blob_id",
                      "size_bytes",
                      "name"
                    ],
                    "type": "object"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "invoice": {
                "anyOf": [
                  {
                    "additionalProperties": false,
                    "properties": {
                      "$media": {
                        "maxLength": 255,
                        "pattern": "^(application|text)/[a-z0-9.+-]+$",
                        "type": "string"
                      },
                      "blob_id": {
                        "pattern": "^sha256-[0-9a-f]{64}$",
                        "type": "string"
                      },
                      "size_bytes": {
                        "minimum": 0,
                        "type": "integer"
                      },
                      "name": {
                        "anyOf": [
                          {
                            "maxLength": 255,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ]
                      },
                      "url": {
                        "anyOf": [
                          {
                            "maxLength": 2048,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "poster_blob_id": {
                        "anyOf": [
                          {
                            "pattern": "^sha256-[0-9a-f]{64}$",
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      },
                      "note": {
                        "anyOf": [
                          {
                            "maxLength": 1000,
                            "type": "string"
                          },
                          {
                            "type": "null"
                          }
                        ],
                        "readOnly": true
                      }
                    },
                    "required": [
                      "$media",
                      "blob_id",
                      "size_bytes",
                      "name"
                    ],
                    "type": "object"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "customer",
              "origin",
              "message",
              "order_id",
              "product",
              "tags",
              "urgent",
              "photo",
              "voice_note",
              "video",
              "invoice"
            ],
            "type": "object"
          }
        },
        "required": [
          "request"
        ],
        "type": "object"
      },
      "declared_out": {
        "additionalProperties": false,
        "properties": {
          "message": {
            "maxLength": 4000,
            "type": "string"
          },
          "channel": {
            "enum": [
              "storefront",
              "amazon",
              "ozon"
            ],
            "type": "string"
          },
          "signals": {
            "items": {
              "additionalProperties": false,
              "properties": {
                "key": {
                  "pattern": "^[a-z][a-z0-9_]{0,39}$",
                  "type": "string"
                },
                "label": {
                  "maxLength": 80,
                  "type": "string"
                }
              },
              "required": [
                "key",
                "label"
              ],
              "type": "object"
            },
            "maxItems": 20,
            "type": "array"
          },
          "intake_fields": {
            "items": {
              "additionalProperties": false,
              "properties": {
                "name": {
                  "pattern": "^[a-z][a-z0-9_]{0,62}$",
                  "type": "string"
                },
                "type": {
                  "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                  "type": "string"
                },
                "description": {
                  "maxLength": 300,
                  "minLength": 1,
                  "type": "string"
                },
                "maxLength": {
                  "anyOf": [
                    {
                      "minimum": 1,
                      "type": "integer"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "maxItems": {
                  "anyOf": [
                    {
                      "minimum": 1,
                      "type": "integer"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "minimum": {
                  "anyOf": [
                    {
                      "type": "integer"
                    },
                    {
                      "type": "number"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "maximum": {
                  "anyOf": [
                    {
                      "type": "integer"
                    },
                    {
                      "type": "number"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "pattern": {
                  "anyOf": [
                    {
                      "maxLength": 500,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "enum": {
                  "anyOf": [
                    {
                      "items": {
                        "type": "string"
                      },
                      "maxItems": 50,
                      "minItems": 1,
                      "type": "array"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "fields": {
                  "anyOf": [
                    {
                      "items": {
                        "$ref": "FieldSpec"
                      },
                      "type": "array"
                    },
                    {
                      "type": "null"
                    }
                  ]
                }
              },
              "required": [
                "name",
                "type",
                "description"
              ],
              "type": "object"
            },
            "maxItems": 10,
            "type": "array"
          },
          "perspectives": {
            "items": {
              "enum": [
                "words",
                "evidence",
                "risk"
              ],
              "type": "string"
            },
            "maxItems": 3,
            "type": "array"
          }
        },
        "required": [
          "message",
          "channel",
          "signals",
          "intake_fields",
          "perspectives"
        ],
        "type": "object"
      }
    },
    "dynamic_slots": [],
    "problems": []
  },
  "support_case/triage": {
    "node_id": "triage",
    "local_id": "triage",
    "parent": null,
    "kind": "llm",
    "path": "flows/support_case/nodes/triage/triage.node.yaml",
    "file_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e",
    "agent": "gemini",
    "inference": "triage",
    "prompt_level": 2,
    "code_ref": null,
    "problems_count": 0,
    "upstream": [
      "prepare"
    ],
    "downstream": [
      "drafts__gemini",
      "drafts__gpt",
      "drafts__mistral",
      "illustrate",
      "intent__escalate",
      "panel",
      "polish__critique",
      "polish__revise",
      "record__extract",
      "route__resolve",
      "search_kb",
      "vote__ballot"
    ],
    "inference_path": "flows/support_case/nodes/triage/triage.inference.yaml",
    "inference_spec": {
      "apiVersion": "aqven/v1",
      "kind": "Inference",
      "description": "Analysis of the request and all attachments",
      "in": [{ "name": "signals", "type": "SignalDef[]", "description": "Allowed signals" }],
      "out": [{ "name": "observations", "type": "Observation[]", "description": "Observations by signal" }],
      "allowed_sets": [{ "type": "SignalKey", "from": "$in.signals[*].key", "labels_from": "$in.signals[*].label" }],
      "prompt": "triage.prompt.md"
    },
    "allowed_set_descriptions": { "SignalKey": "Defect signal key from the product category's catalog" },
    "agent_path": "agents/gemini.yaml",
    "agent_spec": {
      "apiVersion": "aqven/v1",
      "kind": "Agent",
      "description": "Gemini agent",
      "model": "openrouter:google/gemini-2.5-flash-lite",
      "output": { "mode": "auto", "strict": true, "retries": 1, "on_error": "retry", "on_refusal": "fail", "on_truncated": "fail" }
    },
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Node",
      "node": "llm",
      "description": "Analyzes the request text and all attachments: summary, category, observations, safety risk, marketplace fields",
      "limits": null,
      "inference": "triage",
      "agent": "gemini",
      "in": [
        {
          "name": "message",
          "from": "$prepare.out.message",
          "value": null
        },
        {
          "name": "channel",
          "from": "$prepare.out.channel",
          "value": null
        },
        {
          "name": "customer",
          "from": "$input.customer",
          "value": null
        },
        {
          "name": "product",
          "from": "$input.product",
          "value": null
        },
        {
          "name": "signals",
          "from": "$prepare.out.signals",
          "value": null
        },
        {
          "name": "intake_fields",
          "from": "$prepare.out.intake_fields",
          "value": null
        },
        {
          "name": "photo",
          "from": "$input.photo",
          "value": null
        },
        {
          "name": "voice_note",
          "from": "$input.voice_note",
          "value": null
        },
        {
          "name": "video",
          "from": "$input.video",
          "value": null
        },
        {
          "name": "invoice",
          "from": "$input.invoice",
          "value": null
        }
      ]
    },
    "ir_node": {
      "inputs": [
        {
          "kind": "ref",
          "name": "message",
          "ref": "$prepare.out.message"
        },
        {
          "kind": "ref",
          "name": "channel",
          "ref": "$prepare.out.channel"
        },
        {
          "kind": "ref",
          "name": "customer",
          "ref": "$input.customer"
        },
        {
          "kind": "ref",
          "name": "product",
          "ref": "$input.product"
        },
        {
          "kind": "ref",
          "name": "signals",
          "ref": "$prepare.out.signals"
        },
        {
          "kind": "ref",
          "name": "intake_fields",
          "ref": "$prepare.out.intake_fields"
        },
        {
          "kind": "ref",
          "name": "photo",
          "ref": "$input.photo"
        },
        {
          "kind": "ref",
          "name": "voice_note",
          "ref": "$input.voice_note"
        },
        {
          "kind": "ref",
          "name": "video",
          "ref": "$input.video"
        },
        {
          "kind": "ref",
          "name": "invoice",
          "ref": "$input.invoice"
        }
      ],
      "input_schema": {
        "$defs": {
          "Audio": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^audio/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "Customer": {
            "additionalProperties": false,
            "properties": {
              "customer_id": {
                "description": "Customer id in the CRM",
                "pattern": "^cus_[a-z0-9]{12}$",
                "type": "string"
              },
              "display_name": {
                "description": "The name the customer gave",
                "maxLength": 120,
                "type": "string"
              },
              "email": {
                "anyOf": [
                  {
                    "maxLength": 254,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Email address; null if the customer left none"
              },
              "tier": {
                "description": "Service tier",
                "enum": [
                  "standard",
                  "plus",
                  "business"
                ],
                "type": "string"
              },
              "locale": {
                "description": "Language and region for talking to the customer",
                "type": "string"
              }
            },
            "required": [
              "customer_id",
              "display_name",
              "email",
              "tier",
              "locale"
            ],
            "type": "object"
          },
          "Document": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^(application|text)/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "FieldSpec": {
            "additionalProperties": false,
            "properties": {
              "name": {
                "pattern": "^[a-z][a-z0-9_]{0,62}$",
                "type": "string"
              },
              "type": {
                "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                "type": "string"
              },
              "description": {
                "maxLength": 300,
                "minLength": 1,
                "type": "string"
              },
              "maxLength": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maxItems": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "minimum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maximum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "pattern": {
                "anyOf": [
                  {
                    "maxLength": 500,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "enum": {
                "anyOf": [
                  {
                    "items": {
                      "type": "string"
                    },
                    "maxItems": 50,
                    "minItems": 1,
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "fields": {
                "anyOf": [
                  {
                    "items": {
                      "$ref": "#/$defs/FieldSpec"
                    },
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              }
            },
            "required": [
              "name",
              "type",
              "description"
            ],
            "type": "object"
          },
          "Image": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^image/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          },
          "ProductRef": {
            "additionalProperties": false,
            "properties": {
              "sku": {
                "description": "Product SKU",
                "pattern": "^SKU-[A-Z0-9]{6}$",
                "type": "string"
              },
              "name": {
                "description": "Product name in the catalog",
                "maxLength": 120,
                "type": "string"
              },
              "category": {
                "description": "Product category",
                "enum": [
                  "desk_lamp",
                  "floor_lamp",
                  "smart_bulb",
                  "light_strip",
                  "accessory"
                ],
                "type": "string"
              },
              "lamp_kind": {
                "anyOf": [
                  {
                    "enum": [
                      "mains",
                      "rechargeable",
                      "smart_wifi",
                      "smart_zigbee"
                    ],
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Lamp type; null for accessories without their own light"
              }
            },
            "required": [
              "sku",
              "name",
              "category",
              "lamp_kind"
            ],
            "type": "object"
          },
          "SignalDef": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "description": "Signal key",
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "label": {
                "description": "Signal name for the model and the operator",
                "maxLength": 80,
                "type": "string"
              }
            },
            "required": [
              "key",
              "label"
            ],
            "type": "object"
          },
          "Video": {
            "additionalProperties": false,
            "properties": {
              "$media": {
                "maxLength": 255,
                "pattern": "^video/[a-z0-9.+-]+$",
                "type": "string"
              },
              "blob_id": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              },
              "size_bytes": {
                "minimum": 0,
                "type": "integer"
              },
              "name": {
                "anyOf": [
                  {
                    "maxLength": 255,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "url": {
                "anyOf": [
                  {
                    "maxLength": 2048,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "poster_blob_id": {
                "anyOf": [
                  {
                    "pattern": "^sha256-[0-9a-f]{64}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              },
              "note": {
                "anyOf": [
                  {
                    "maxLength": 1000,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null,
                "readOnly": true
              }
            },
            "required": [
              "$media",
              "blob_id",
              "size_bytes",
              "name"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "message": {
            "description": "Text of the customer's request after whitespace normalization",
            "maxLength": 4000,
            "type": "string"
          },
          "channel": {
            "description": "Channel the request arrived through",
            "enum": [
              "storefront",
              "amazon",
              "ozon"
            ],
            "type": "string"
          },
          "customer": {
            "$ref": "#/$defs/Customer",
            "description": "The customer who wrote the request"
          },
          "product": {
            "anyOf": [
              {
                "$ref": "#/$defs/ProductRef"
              },
              {
                "type": "null"
              }
            ],
            "description": "The product the customer chose in the request; null if none is given"
          },
          "signals": {
            "description": "Category signals that observations may mark",
            "items": {
              "$ref": "#/$defs/SignalDef"
            },
            "maxItems": 20,
            "type": "array"
          },
          "intake_fields": {
            "description": "Marketplace intake fields filled from the request; an empty list means no extra fields",
            "items": {
              "$ref": "#/$defs/FieldSpec"
            },
            "maxItems": 10,
            "type": "array"
          },
          "photo": {
            "anyOf": [
              {
                "$ref": "#/$defs/Image"
              },
              {
                "type": "null"
              }
            ],
            "description": "Photo of the product or defect; null if no photo is attached"
          },
          "voice_note": {
            "anyOf": [
              {
                "$ref": "#/$defs/Audio"
              },
              {
                "type": "null"
              }
            ],
            "description": "The customer's voice message; null if there is none"
          },
          "video": {
            "anyOf": [
              {
                "$ref": "#/$defs/Video"
              },
              {
                "type": "null"
              }
            ],
            "description": "Video showing the defect; null if no video is attached"
          },
          "invoice": {
            "anyOf": [
              {
                "$ref": "#/$defs/Document"
              },
              {
                "type": "null"
              }
            ],
            "description": "Invoice or receipt; null if no document is attached"
          }
        },
        "required": [
          "message",
          "channel",
          "customer",
          "product",
          "signals",
          "intake_fields",
          "photo",
          "voice_note",
          "video",
          "invoice"
        ],
        "type": "object"
      },
      "node_id": "triage",
      "parent": null,
      "description": "Analyzes the request text and all attachments: summary, category, observations, safety risk, marketplace fields",
      "limits": null,
      "output_schema": {
        "$defs": {
          "DynamicValue": {
            "additionalProperties": false,
            "properties": {
              "value": {
                "$ref": "#/$defs/JsonValue"
              },
              "fields": {
                "items": {
                  "$ref": "#/$defs/FieldSpec"
                },
                "type": "array"
              },
              "schema_hash": {
                "pattern": "^sha256-[0-9a-f]{64}$",
                "type": "string"
              }
            },
            "required": [
              "value",
              "fields",
              "schema_hash"
            ],
            "type": "object"
          },
          "FieldSpec": {
            "additionalProperties": false,
            "properties": {
              "name": {
                "pattern": "^[a-z][a-z0-9_]{0,62}$",
                "type": "string"
              },
              "type": {
                "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                "type": "string"
              },
              "description": {
                "maxLength": 300,
                "minLength": 1,
                "type": "string"
              },
              "maxLength": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maxItems": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "minimum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "maximum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "pattern": {
                "anyOf": [
                  {
                    "maxLength": 500,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "enum": {
                "anyOf": [
                  {
                    "items": {
                      "type": "string"
                    },
                    "maxItems": 50,
                    "minItems": 1,
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              },
              "fields": {
                "anyOf": [
                  {
                    "items": {
                      "$ref": "#/$defs/FieldSpec"
                    },
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ],
                "default": null
              }
            },
            "required": [
              "name",
              "type",
              "description"
            ],
            "type": "object"
          },
          "JsonValue": {},
          "Observation": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "description": "Signal key from the category's list",
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "value": {
                "description": "What exactly was noticed in the text or attachments",
                "maxLength": 200,
                "type": "string"
              }
            },
            "required": [
              "key",
              "value"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "summary": {
            "description": "Summary of the request from its text and attachments",
            "maxLength": 600,
            "type": "string"
          },
          "category": {
            "description": "Category of the product in question",
            "enum": [
              "desk_lamp",
              "floor_lamp",
              "smart_bulb",
              "light_strip",
              "accessory"
            ],
            "type": "string"
          },
          "observations": {
            "description": "Observations by category signal, at most one per signal",
            "items": {
              "$ref": "#/$defs/Observation"
            },
            "maxItems": 12,
            "type": "array"
          },
          "safety_risk": {
            "description": "Whether the request or attachments show signs of a safety hazard",
            "type": "boolean"
          },
          "intake_extra": {
            "$ref": "#/$defs/DynamicValue",
            "description": "Values of the marketplace intake fields, shaped by the input"
          }
        },
        "required": [
          "summary",
          "category",
          "observations",
          "safety_risk",
          "intake_extra"
        ],
        "type": "object"
      },
      "kind": "llm",
      "agent": "gemini",
      "inference": "triage",
      "output_mode": "tool"
    },
    "in_schema": {
      "additionalProperties": false,
      "properties": {
        "message": {
          "maxLength": 4000,
          "type": "string"
        },
        "channel": {
          "enum": [
            "storefront",
            "amazon",
            "ozon"
          ],
          "type": "string"
        },
        "customer": {
          "additionalProperties": false,
          "properties": {
            "customer_id": {
              "pattern": "^cus_[a-z0-9]{12}$",
              "type": "string"
            },
            "display_name": {
              "maxLength": 120,
              "type": "string"
            },
            "email": {
              "anyOf": [
                {
                  "maxLength": 254,
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            },
            "tier": {
              "enum": [
                "standard",
                "plus",
                "business"
              ],
              "type": "string"
            },
            "locale": {
              "type": "string"
            }
          },
          "required": [
            "customer_id",
            "display_name",
            "email",
            "tier",
            "locale"
          ],
          "type": "object"
        },
        "product": {
          "anyOf": [
            {
              "additionalProperties": false,
              "properties": {
                "sku": {
                  "pattern": "^SKU-[A-Z0-9]{6}$",
                  "type": "string"
                },
                "name": {
                  "maxLength": 120,
                  "type": "string"
                },
                "category": {
                  "enum": [
                    "desk_lamp",
                    "floor_lamp",
                    "smart_bulb",
                    "light_strip",
                    "accessory"
                  ],
                  "type": "string"
                },
                "lamp_kind": {
                  "anyOf": [
                    {
                      "enum": [
                        "mains",
                        "rechargeable",
                        "smart_wifi",
                        "smart_zigbee"
                      ],
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                }
              },
              "required": [
                "sku",
                "name",
                "category",
                "lamp_kind"
              ],
              "type": "object"
            },
            {
              "type": "null"
            }
          ]
        },
        "signals": {
          "items": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "label": {
                "maxLength": 80,
                "type": "string"
              }
            },
            "required": [
              "key",
              "label"
            ],
            "type": "object"
          },
          "maxItems": 20,
          "type": "array"
        },
        "intake_fields": {
          "items": {
            "additionalProperties": false,
            "properties": {
              "name": {
                "pattern": "^[a-z][a-z0-9_]{0,62}$",
                "type": "string"
              },
              "type": {
                "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                "type": "string"
              },
              "description": {
                "maxLength": 300,
                "minLength": 1,
                "type": "string"
              },
              "maxLength": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "maxItems": {
                "anyOf": [
                  {
                    "minimum": 1,
                    "type": "integer"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "minimum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "maximum": {
                "anyOf": [
                  {
                    "type": "integer"
                  },
                  {
                    "type": "number"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "pattern": {
                "anyOf": [
                  {
                    "maxLength": 500,
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "enum": {
                "anyOf": [
                  {
                    "items": {
                      "type": "string"
                    },
                    "maxItems": 50,
                    "minItems": 1,
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ]
              },
              "fields": {
                "anyOf": [
                  {
                    "items": {
                      "$ref": "FieldSpec"
                    },
                    "type": "array"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "name",
              "type",
              "description"
            ],
            "type": "object"
          },
          "maxItems": 10,
          "type": "array"
        },
        "photo": {
          "anyOf": [
            {
              "additionalProperties": false,
              "properties": {
                "$media": {
                  "maxLength": 255,
                  "pattern": "^image/[a-z0-9.+-]+$",
                  "type": "string"
                },
                "blob_id": {
                  "pattern": "^sha256-[0-9a-f]{64}$",
                  "type": "string"
                },
                "size_bytes": {
                  "minimum": 0,
                  "type": "integer"
                },
                "name": {
                  "anyOf": [
                    {
                      "maxLength": 255,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "url": {
                  "anyOf": [
                    {
                      "maxLength": 2048,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "poster_blob_id": {
                  "anyOf": [
                    {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "note": {
                  "anyOf": [
                    {
                      "maxLength": 1000,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                }
              },
              "required": [
                "$media",
                "blob_id",
                "size_bytes",
                "name"
              ],
              "type": "object"
            },
            {
              "type": "null"
            }
          ]
        },
        "voice_note": {
          "anyOf": [
            {
              "additionalProperties": false,
              "properties": {
                "$media": {
                  "maxLength": 255,
                  "pattern": "^audio/[a-z0-9.+-]+$",
                  "type": "string"
                },
                "blob_id": {
                  "pattern": "^sha256-[0-9a-f]{64}$",
                  "type": "string"
                },
                "size_bytes": {
                  "minimum": 0,
                  "type": "integer"
                },
                "name": {
                  "anyOf": [
                    {
                      "maxLength": 255,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "url": {
                  "anyOf": [
                    {
                      "maxLength": 2048,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "poster_blob_id": {
                  "anyOf": [
                    {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "note": {
                  "anyOf": [
                    {
                      "maxLength": 1000,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                }
              },
              "required": [
                "$media",
                "blob_id",
                "size_bytes",
                "name"
              ],
              "type": "object"
            },
            {
              "type": "null"
            }
          ]
        },
        "video": {
          "anyOf": [
            {
              "additionalProperties": false,
              "properties": {
                "$media": {
                  "maxLength": 255,
                  "pattern": "^video/[a-z0-9.+-]+$",
                  "type": "string"
                },
                "blob_id": {
                  "pattern": "^sha256-[0-9a-f]{64}$",
                  "type": "string"
                },
                "size_bytes": {
                  "minimum": 0,
                  "type": "integer"
                },
                "name": {
                  "anyOf": [
                    {
                      "maxLength": 255,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "url": {
                  "anyOf": [
                    {
                      "maxLength": 2048,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "poster_blob_id": {
                  "anyOf": [
                    {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "note": {
                  "anyOf": [
                    {
                      "maxLength": 1000,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                }
              },
              "required": [
                "$media",
                "blob_id",
                "size_bytes",
                "name"
              ],
              "type": "object"
            },
            {
              "type": "null"
            }
          ]
        },
        "invoice": {
          "anyOf": [
            {
              "additionalProperties": false,
              "properties": {
                "$media": {
                  "maxLength": 255,
                  "pattern": "^(application|text)/[a-z0-9.+-]+$",
                  "type": "string"
                },
                "blob_id": {
                  "pattern": "^sha256-[0-9a-f]{64}$",
                  "type": "string"
                },
                "size_bytes": {
                  "minimum": 0,
                  "type": "integer"
                },
                "name": {
                  "anyOf": [
                    {
                      "maxLength": 255,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "url": {
                  "anyOf": [
                    {
                      "maxLength": 2048,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "poster_blob_id": {
                  "anyOf": [
                    {
                      "pattern": "^sha256-[0-9a-f]{64}$",
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                },
                "note": {
                  "anyOf": [
                    {
                      "maxLength": 1000,
                      "type": "string"
                    },
                    {
                      "type": "null"
                    }
                  ],
                  "readOnly": true
                }
              },
              "required": [
                "$media",
                "blob_id",
                "size_bytes",
                "name"
              ],
              "type": "object"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "message",
        "channel",
        "customer",
        "product",
        "signals",
        "intake_fields",
        "photo",
        "voice_note",
        "video",
        "invoice"
      ],
      "type": "object"
    },
    "out_schema": {
      "additionalProperties": false,
      "properties": {
        "summary": {
          "maxLength": 600,
          "type": "string"
        },
        "category": {
          "enum": [
            "desk_lamp",
            "floor_lamp",
            "smart_bulb",
            "light_strip",
            "accessory"
          ],
          "type": "string"
        },
        "observations": {
          "items": {
            "additionalProperties": false,
            "properties": {
              "key": {
                "pattern": "^[a-z][a-z0-9_]{0,39}$",
                "type": "string"
              },
              "value": {
                "maxLength": 200,
                "type": "string"
              }
            },
            "required": [
              "key",
              "value"
            ],
            "type": "object"
          },
          "maxItems": 12,
          "type": "array"
        },
        "safety_risk": {
          "type": "boolean"
        },
        "intake_extra": {
          "additionalProperties": false,
          "properties": {
            "value": {},
            "fields": {
              "items": {
                "additionalProperties": false,
                "properties": {
                  "name": {
                    "pattern": "^[a-z][a-z0-9_]{0,62}$",
                    "type": "string"
                  },
                  "type": {
                    "pattern": "^[A-Z][A-Za-z0-9_]{0,62}(\\[\\])?\\??$",
                    "type": "string"
                  },
                  "description": {
                    "maxLength": 300,
                    "minLength": 1,
                    "type": "string"
                  },
                  "maxLength": {
                    "anyOf": [
                      {
                        "minimum": 1,
                        "type": "integer"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "maxItems": {
                    "anyOf": [
                      {
                        "minimum": 1,
                        "type": "integer"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "minimum": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "number"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "maximum": {
                    "anyOf": [
                      {
                        "type": "integer"
                      },
                      {
                        "type": "number"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "pattern": {
                    "anyOf": [
                      {
                        "maxLength": 500,
                        "type": "string"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "enum": {
                    "anyOf": [
                      {
                        "items": {
                          "type": "string"
                        },
                        "maxItems": 50,
                        "minItems": 1,
                        "type": "array"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  },
                  "fields": {
                    "anyOf": [
                      {
                        "items": {
                          "$ref": "FieldSpec"
                        },
                        "type": "array"
                      },
                      {
                        "type": "null"
                      }
                    ]
                  }
                },
                "required": [
                  "name",
                  "type",
                  "description"
                ],
                "type": "object"
              },
              "type": "array"
            },
            "schema_hash": {
              "pattern": "^sha256-[0-9a-f]{64}$",
              "type": "string"
            }
          },
          "required": [
            "value",
            "fields",
            "schema_hash"
          ],
          "type": "object"
        }
      },
      "required": [
        "summary",
        "category",
        "observations",
        "safety_risk",
        "intake_extra"
      ],
      "type": "object"
    },
    "form_schema": null,
    "bindings": [
      {
        "slot": "message",
        "ref": "$prepare.out.message",
        "value": null
      },
      {
        "slot": "channel",
        "ref": "$prepare.out.channel",
        "value": null
      },
      {
        "slot": "customer",
        "ref": "$input.customer",
        "value": null
      },
      {
        "slot": "product",
        "ref": "$input.product",
        "value": null
      },
      {
        "slot": "signals",
        "ref": "$prepare.out.signals",
        "value": null
      },
      {
        "slot": "intake_fields",
        "ref": "$prepare.out.intake_fields",
        "value": null
      },
      {
        "slot": "photo",
        "ref": "$input.photo",
        "value": null
      },
      {
        "slot": "voice_note",
        "ref": "$input.voice_note",
        "value": null
      },
      {
        "slot": "video",
        "ref": "$input.video",
        "value": null
      },
      {
        "slot": "invoice",
        "ref": "$input.invoice",
        "value": null
      }
    ],
    "prompt": {
      "inference_id": "triage",
      "level": 2,
      "path": "flows/support_case/nodes/triage/triage.prompt.md",
      "builder_ref": null
    },
    "code": null,
    "dynamic_slots": [
      {
        "path": [
          "out",
          "intake_extra"
        ],
        "schema_from": "$in.intake_fields",
        "limits": {
          "max_fields": 10,
          "max_depth": 1,
          "max_text_length": 200,
          "max_items": 5
        }
      }
    ],
    "problems": []
  },
  "support_case/approvals__lead": {
    "node_id": "approvals__lead",
    "local_id": "lead",
    "parent": "approvals",
    "kind": "human",
    "path": "flows/support_case/nodes/approvals/lead.node.yaml",
    "file_hash": "sha256-4f0b1c0b4eb42cccd95daaf22d9b5fda711aaa8133502a5aa0ed7a5e39ab5654",
    "agent": null,
    "inference": null,
    "prompt_level": null,
    "code_ref": null,
    "problems_count": 0,
    "upstream": [
      "polish",
      "route"
    ],
    "downstream": [
      "approvals"
    ],
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Node",
      "node": "human",
      "description": "The support lead approves, edits or rejects the reply",
      "limits": null,
      "form": "ReplyApproval",
      "assignee": "support_lead",
      "timeout_seconds": 14400,
      "on_timeout": {
        "policy": "escalate",
        "assignee": "support_manager",
        "timeout_seconds": 7200
      },
      "in": [
        {
          "name": "reply",
          "type": "ReplyDraft",
          "description": "Reply after polishing",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "from": "$polish.out.reply",
          "value": null
        },
        {
          "name": "resolution",
          "type": "Resolution",
          "description": "Decision on the request",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "from": "$route.out.resolution",
          "value": null
        },
        {
          "name": "score",
          "type": "Score",
          "description": "The critic's score for the reply",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "from": "$polish.out.score",
          "value": null
        },
        {
          "name": "iterations",
          "type": "Int",
          "description": "How many editing rounds the reply went through",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null,
          "from": "$polish.out.iterations",
          "value": null
        }
      ]
    },
    "ir_node": {
      "inputs": [
        {
          "kind": "ref",
          "name": "reply",
          "ref": "$polish.out.reply"
        },
        {
          "kind": "ref",
          "name": "resolution",
          "ref": "$route.out.resolution"
        },
        {
          "kind": "ref",
          "name": "score",
          "ref": "$polish.out.score"
        },
        {
          "kind": "ref",
          "name": "iterations",
          "ref": "$polish.out.iterations"
        }
      ],
      "input_schema": {
        "$defs": {
          "Citation": {
            "additionalProperties": false,
            "properties": {
              "chunk_id": {
                "description": "The passage the quote comes from",
                "pattern": "^kb_[a-z0-9]{10}$",
                "type": "string"
              },
              "quote": {
                "description": "Verbatim quote from the passage",
                "maxLength": 300,
                "type": "string"
              }
            },
            "required": [
              "chunk_id",
              "quote"
            ],
            "type": "object"
          },
          "Money": {
            "additionalProperties": false,
            "properties": {
              "amount_minor": {
                "description": "Amount in cents, pence or other minor units",
                "maximum": 1000000000,
                "minimum": 0,
                "type": "integer"
              },
              "currency": {
                "description": "Currency of the amount",
                "enum": [
                  "eur",
                  "usd",
                  "gbp"
                ],
                "type": "string"
              }
            },
            "required": [
              "amount_minor",
              "currency"
            ],
            "type": "object"
          },
          "ReplyDraft": {
            "additionalProperties": false,
            "properties": {
              "text": {
                "description": "Text of the reply to the customer",
                "maxLength": 1500,
                "type": "string"
              },
              "citations": {
                "description": "Quotes the reply relies on",
                "items": {
                  "$ref": "#/$defs/Citation"
                },
                "maxItems": 6,
                "type": "array"
              }
            },
            "required": [
              "text",
              "citations"
            ],
            "type": "object"
          },
          "Resolution": {
            "additionalProperties": false,
            "properties": {
              "action": {
                "description": "What we do about the request",
                "enum": [
                  "store_credit",
                  "replacement",
                  "reship",
                  "advice"
                ],
                "type": "string"
              },
              "summary": {
                "description": "The gist of the decision for the customer and the operator",
                "maxLength": 400,
                "type": "string"
              },
              "credit": {
                "anyOf": [
                  {
                    "$ref": "#/$defs/Money"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "Store credit amount; null if no credit is given"
              },
              "policy": {
                "anyOf": [
                  {
                    "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                    "type": "string"
                  },
                  {
                    "type": "null"
                  }
                ],
                "description": "The policy the decision rests on; null if the decision is not policy-based"
              }
            },
            "required": [
              "action",
              "summary",
              "credit",
              "policy"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "reply": {
            "$ref": "#/$defs/ReplyDraft",
            "description": "Reply after polishing"
          },
          "resolution": {
            "$ref": "#/$defs/Resolution",
            "description": "Decision on the request"
          },
          "score": {
            "description": "The critic's score for the reply",
            "maximum": 1,
            "minimum": 0,
            "type": "number"
          },
          "iterations": {
            "description": "How many editing rounds the reply went through",
            "type": "integer"
          }
        },
        "required": [
          "reply",
          "resolution",
          "score",
          "iterations"
        ],
        "type": "object"
      },
      "node_id": "approvals__lead",
      "parent": "approvals",
      "description": "The support lead approves, edits or rejects the reply",
      "limits": null,
      "output_schema": {
        "additionalProperties": false,
        "properties": {
          "decision": {
            "description": "Decision on the reply",
            "enum": [
              "approve",
              "edit",
              "reject"
            ],
            "type": "string"
          },
          "edited_text": {
            "anyOf": [
              {
                "maxLength": 1500,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "Edited text when revised; otherwise null"
          },
          "note": {
            "anyOf": [
              {
                "maxLength": 400,
                "type": "string"
              },
              {
                "type": "null"
              }
            ],
            "description": "The lead's note; null if there is none"
          }
        },
        "required": [
          "decision",
          "edited_text",
          "note"
        ],
        "type": "object"
      },
      "kind": "human",
      "form": "ReplyApproval",
      "assignee": "support_lead",
      "timeout_seconds": 14400,
      "on_timeout": {
        "policy": "escalate",
        "assignee": "support_manager",
        "timeout_seconds": 7200
      }
    },
    "in_schema": {
      "additionalProperties": false,
      "properties": {
        "reply": {
          "additionalProperties": false,
          "properties": {
            "text": {
              "maxLength": 1500,
              "type": "string"
            },
            "citations": {
              "items": {
                "additionalProperties": false,
                "properties": {
                  "chunk_id": {
                    "pattern": "^kb_[a-z0-9]{10}$",
                    "type": "string"
                  },
                  "quote": {
                    "maxLength": 300,
                    "type": "string"
                  }
                },
                "required": [
                  "chunk_id",
                  "quote"
                ],
                "type": "object"
              },
              "maxItems": 6,
              "type": "array"
            }
          },
          "required": [
            "text",
            "citations"
          ],
          "type": "object"
        },
        "resolution": {
          "additionalProperties": false,
          "properties": {
            "action": {
              "enum": [
                "store_credit",
                "replacement",
                "reship",
                "advice"
              ],
              "type": "string"
            },
            "summary": {
              "maxLength": 400,
              "type": "string"
            },
            "credit": {
              "anyOf": [
                {
                  "additionalProperties": false,
                  "properties": {
                    "amount_minor": {
                      "maximum": 1000000000,
                      "minimum": 0,
                      "type": "integer"
                    },
                    "currency": {
                      "enum": [
                        "eur",
                        "usd",
                        "gbp"
                      ],
                      "type": "string"
                    }
                  },
                  "required": [
                    "amount_minor",
                    "currency"
                  ],
                  "type": "object"
                },
                {
                  "type": "null"
                }
              ]
            },
            "policy": {
              "anyOf": [
                {
                  "pattern": "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
                  "type": "string"
                },
                {
                  "type": "null"
                }
              ]
            }
          },
          "required": [
            "action",
            "summary",
            "credit",
            "policy"
          ],
          "type": "object"
        },
        "score": {
          "maximum": 1,
          "minimum": 0,
          "type": "number"
        },
        "iterations": {
          "type": "integer"
        }
      },
      "required": [
        "reply",
        "resolution",
        "score",
        "iterations"
      ],
      "type": "object"
    },
    "out_schema": {
      "additionalProperties": false,
      "properties": {
        "decision": {
          "enum": [
            "approve",
            "edit",
            "reject"
          ],
          "type": "string"
        },
        "edited_text": {
          "anyOf": [
            {
              "maxLength": 1500,
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "note": {
          "anyOf": [
            {
              "maxLength": 400,
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "decision",
        "edited_text",
        "note"
      ],
      "type": "object"
    },
    "form_schema": {
      "additionalProperties": false,
      "properties": {
        "decision": {
          "enum": [
            "approve",
            "edit",
            "reject"
          ],
          "type": "string"
        },
        "edited_text": {
          "anyOf": [
            {
              "maxLength": 1500,
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        },
        "note": {
          "anyOf": [
            {
              "maxLength": 400,
              "type": "string"
            },
            {
              "type": "null"
            }
          ]
        }
      },
      "required": [
        "decision",
        "edited_text",
        "note"
      ],
      "type": "object"
    },
    "bindings": [
      {
        "slot": "reply",
        "ref": "$polish.out.reply",
        "value": null
      },
      {
        "slot": "resolution",
        "ref": "$route.out.resolution",
        "value": null
      },
      {
        "slot": "score",
        "ref": "$polish.out.score",
        "value": null
      },
      {
        "slot": "iterations",
        "ref": "$polish.out.iterations",
        "value": null
      }
    ],
    "prompt": null,
    "code": null,
    "dynamic_slots": [],
    "problems": []
  },
  "judge_panel/decide": {
    "node_id": "decide",
    "local_id": "decide",
    "parent": null,
    "kind": "switch",
    "path": "flows/judge_panel/nodes/decide/decide.node.yaml",
    "file_hash": "sha256-589a2bc0409675d0e2ceeac1c201fae2e8d94682d4a4e666b40c1a70578be890",
    "agent": null,
    "inference": null,
    "prompt_level": null,
    "code_ref": null,
    "problems_count": 0,
    "upstream": [
      "aggregate",
      "decide__tie_break"
    ],
    "downstream": [
      "pick"
    ],
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Node",
      "node": "switch",
      "description": "When the judges agree it takes the combined verdict; when they disagree it calls the tie-break judge",
      "limits": null,
      "on": "$aggregate.out.level",
      "cases": {
        "agreed": {
          "node": null,
          "bind": [
            {
              "name": "verdict",
              "from": "$aggregate.out.consensus",
              "value": null
            },
            {
              "name": "tie_broken",
              "from": null,
              "value": false
            }
          ]
        },
        "split": {
          "node": "tie_break",
          "bind": [
            {
              "name": "verdict",
              "from": "$tie_break.out",
              "value": null
            },
            {
              "name": "tie_broken",
              "from": null,
              "value": true
            }
          ]
        }
      },
      "out": [
        {
          "name": "verdict",
          "type": "JudgeVerdict",
          "description": "The panel's final verdict",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        },
        {
          "name": "tie_broken",
          "type": "Bool",
          "description": "The tie-break judge gave the verdict",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        }
      ]
    },
    "ir_node": {
      "node_id": "decide",
      "parent": null,
      "description": "When the judges agree it takes the combined verdict; when they disagree it calls the tie-break judge",
      "limits": null,
      "output_schema": {
        "$defs": {
          "CriterionScore": {
            "additionalProperties": false,
            "properties": {
              "criterion": {
                "description": "Scoring criterion",
                "enum": [
                  "grounded",
                  "helpful",
                  "tone"
                ],
                "type": "string"
              },
              "score": {
                "description": "Score from 1 to 5",
                "maximum": 5,
                "minimum": 1,
                "type": "integer"
              }
            },
            "required": [
              "criterion",
              "score"
            ],
            "type": "object"
          },
          "JudgeVerdict": {
            "additionalProperties": false,
            "properties": {
              "rationale": {
                "description": "Rationale written before the scores",
                "maxLength": 600,
                "type": "string"
              },
              "scores": {
                "description": "Scores of the best candidate by criterion",
                "items": {
                  "$ref": "#/$defs/CriterionScore"
                },
                "maxItems": 3,
                "type": "array"
              },
              "best_index": {
                "description": "Index of the best candidate, from zero",
                "maximum": 2,
                "minimum": 0,
                "type": "integer"
              }
            },
            "required": [
              "rationale",
              "scores",
              "best_index"
            ],
            "type": "object"
          }
        },
        "additionalProperties": false,
        "properties": {
          "verdict": {
            "$ref": "#/$defs/JudgeVerdict",
            "description": "The panel's final verdict"
          },
          "tie_broken": {
            "description": "The tie-break judge gave the verdict",
            "type": "boolean"
          }
        },
        "required": [
          "verdict",
          "tie_broken"
        ],
        "type": "object"
      },
      "kind": "switch",
      "on": "$aggregate.out.level",
      "cases": {
        "agreed": {
          "node": null,
          "bindings": [
            {
              "kind": "ref",
              "name": "verdict",
              "ref": "$aggregate.out.consensus"
            },
            {
              "kind": "literal",
              "name": "tie_broken",
              "value": false
            }
          ]
        },
        "split": {
          "node": "decide__tie_break",
          "bindings": [
            {
              "kind": "ref",
              "name": "verdict",
              "ref": "$tie_break.out"
            },
            {
              "kind": "literal",
              "name": "tie_broken",
              "value": true
            }
          ]
        }
      },
      "output_names": [
        "verdict",
        "tie_broken"
      ]
    },
    "in_schema": null,
    "out_schema": {
      "additionalProperties": false,
      "properties": {
        "verdict": {
          "additionalProperties": false,
          "properties": {
            "rationale": {
              "maxLength": 600,
              "type": "string"
            },
            "scores": {
              "items": {
                "additionalProperties": false,
                "properties": {
                  "criterion": {
                    "enum": [
                      "grounded",
                      "helpful",
                      "tone"
                    ],
                    "type": "string"
                  },
                  "score": {
                    "maximum": 5,
                    "minimum": 1,
                    "type": "integer"
                  }
                },
                "required": [
                  "criterion",
                  "score"
                ],
                "type": "object"
              },
              "maxItems": 3,
              "type": "array"
            },
            "best_index": {
              "maximum": 2,
              "minimum": 0,
              "type": "integer"
            }
          },
          "required": [
            "rationale",
            "scores",
            "best_index"
          ],
          "type": "object"
        },
        "tie_broken": {
          "type": "boolean"
        }
      },
      "required": [
        "verdict",
        "tie_broken"
      ],
      "type": "object"
    },
    "form_schema": null,
    "bindings": [],
    "prompt": null,
    "code": null,
    "dynamic_slots": [],
    "problems": []
  }
}

export const liveNodePrompts: Readonly<Record<string, ApiPromptDetail>> = {
  "support_case/triage": {
    "flow_id": "support_case",
    "node_id": "triage",
    "inference_id": "triage",
    "level": 2,
    "path": "flows/support_case/nodes/triage/triage.prompt.md",
    "file_hash": "sha256-98f86b6b94d66ac1601a03ffa670fe98ec929c9d7ccbb41b8f1b2f3cef2047ba",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system cache %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\nDo not promise compensation, refunds or credit that the decision does not include.\nQuote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.\nYou write a reply to a customer on behalf of the Lumen support team.\nAnswer in the customer's language and keep the tone calm and friendly.\n{% include \"fragments/safety_escalation\" %}\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\n{% case channel %}\n{% when \"storefront\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"amazon\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"ozon\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endcase %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ customer.locale }}.\n{% if product %}\nDo not promise compensation, refunds or credit that the decision does not include.{{ product.name }}Do not promise compensation, refunds or credit that the decision does not include. {{ product.category }}Answer in the customer's language and keep the tone calm and friendly.\n{% endif %}\n{% if photo %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endif %}\n{% if voice_note %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endif %}\n{% if video %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% endif %}\n{% if invoice %}\nThe reply goes to the store chat, so plain text works best.\n{% endif %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for signal in signals %}\n- {{ signal.key }}: {{ signal.label }}\n{% endfor %}\nQuote the knowledge base passages you rely on, word for word.\n{% for field in intake_fields %}\n- {{ field.name }}: {{ field.description }}\n{% endfor %}\nAnswer in the customer's language and keep the tone calm and friendly.\n{{ message }}\n</customer_message>\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-98f86b6b94d66ac1601a03ffa670fe98ec929c9d7ccbb41b8f1b2f3cef2047ba"
    },
    "analysis": {
      "variables": [
        "channel",
        "customer",
        "field",
        "intake_fields",
        "invoice",
        "message",
        "output_format",
        "photo",
        "product",
        "signal",
        "signals",
        "video",
        "voice_note"
      ],
      "globals": [
        "channel",
        "customer",
        "intake_fields",
        "invoice",
        "message",
        "output_format",
        "photo",
        "product",
        "signals",
        "video",
        "voice_note"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "message",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "channel",
        "type_id": "Channel",
        "used": true
      },
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "product",
        "type_id": "ProductRef?",
        "used": true
      },
      {
        "name": "signals",
        "type_id": "SignalDef[]",
        "used": true
      },
      {
        "name": "intake_fields",
        "type_id": "FieldSpec[]",
        "used": true
      },
      {
        "name": "photo",
        "type_id": "Image?",
        "used": true
      },
      {
        "name": "voice_note",
        "type_id": "Audio?",
        "used": true
      },
      {
        "name": "video",
        "type_id": "Video?",
        "used": true
      },
      {
        "name": "invoice",
        "type_id": "Document?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/vote__ballot": {
    "flow_id": "support_case",
    "node_id": "vote__ballot",
    "inference_id": "ballot",
    "level": 2,
    "path": "flows/support_case/nodes/vote/ballot.prompt.md",
    "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team. Answer in the customer's language and keep the tone calm and friendly.\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\n{% if perspective %}\n{% case perspective %}\n{% when \"words\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"evidence\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"risk\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% endcase %}\n{% endif %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% for observation in observations %}\n- {{ observation.key }}: {{ observation.value }}\n{% endfor %}\n{% if safety_risk %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endif %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95"
    },
    "analysis": {
      "variables": [
        "observation",
        "observations",
        "output_format",
        "perspective",
        "safety_risk",
        "summary"
      ],
      "globals": [
        "observations",
        "output_format",
        "perspective",
        "safety_risk",
        "summary"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "observations",
        "type_id": "Observation[]",
        "used": true
      },
      {
        "name": "safety_risk",
        "type_id": "Bool",
        "used": true
      },
      {
        "name": "perspective",
        "type_id": "VotePerspective?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/intent__escalate": {
    "flow_id": "support_case",
    "node_id": "intent__escalate",
    "inference_id": "ballot",
    "level": 2,
    "path": "flows/support_case/nodes/vote/ballot.prompt.md",
    "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team. Answer in the customer's language and keep the tone calm and friendly.\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\n{% if perspective %}\n{% case perspective %}\n{% when \"words\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"evidence\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"risk\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% endcase %}\n{% endif %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% for observation in observations %}\n- {{ observation.key }}: {{ observation.value }}\n{% endfor %}\n{% if safety_risk %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endif %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95"
    },
    "analysis": {
      "variables": [
        "observation",
        "observations",
        "output_format",
        "perspective",
        "safety_risk",
        "summary"
      ],
      "globals": [
        "observations",
        "output_format",
        "perspective",
        "safety_risk",
        "summary"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "observations",
        "type_id": "Observation[]",
        "used": true
      },
      {
        "name": "safety_risk",
        "type_id": "Bool",
        "used": true
      },
      {
        "name": "perspective",
        "type_id": "VotePerspective?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/record__extract": {
    "flow_id": "support_case",
    "node_id": "record__extract",
    "inference_id": "extract",
    "level": 2,
    "path": "flows/support_case/nodes/record/extract.prompt.md",
    "file_hash": "sha256-d8ec2a342c2466fb4df8a0ac551917325543de607963692e92bc7de8d9bca988",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{% for field in form_fields %}\n- {{ field.name }}: {{ field.description }}\n{% endfor %}\n{% if feedback %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for issue in feedback %}\n- {{ issue.message }}\n{% if issue.repair_hint %}\n  If the request mentions heat, smoke, sparks or a burning smell, start with the safety step. {{ issue.repair_hint }}\n{% endif %}\n{% endfor %}\n{% endif %}\n{% if photo %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{% endif %}\n{% if invoice %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% endif %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\nYou write a reply to a customer on behalf of the Lumen support team.\n{{ message }}\n</customer_message>\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-d8ec2a342c2466fb4df8a0ac551917325543de607963692e92bc7de8d9bca988"
    },
    "analysis": {
      "variables": [
        "feedback",
        "field",
        "form_fields",
        "invoice",
        "issue",
        "message",
        "output_format",
        "photo",
        "summary"
      ],
      "globals": [
        "feedback",
        "form_fields",
        "invoice",
        "message",
        "output_format",
        "photo",
        "summary"
      ],
      "filters": [],
      "tags": [
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "message",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "form_fields",
        "type_id": "FieldSpec[]",
        "used": true
      },
      {
        "name": "feedback",
        "type_id": "Issue[]?",
        "used": true
      },
      {
        "name": "photo",
        "type_id": "Image?",
        "used": true
      },
      {
        "name": "invoice",
        "type_id": "Document?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/route__resolve": {
    "flow_id": "support_case",
    "node_id": "route__resolve",
    "inference_id": "resolve",
    "level": 2,
    "path": "flows/support_case/nodes/route/resolve.prompt.md",
    "file_hash": "sha256-62ed2400b2374968409658ffd0d455e243f8a4f746fae5800eae4ec16e9d4292",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team. Answer in the customer's language and keep the tone calm and friendly.\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\n{% case customer.tier %}\n{% when \"standard\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"plus\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"business\" %}\nBase every promise on the accepted decision and the knowledge base passages provided. If the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endcase %}\nQuote the knowledge base passages you rely on, word for word. {{ customer.customer_id }}Answer in the customer's language and keep the tone calm and friendly. {{ order_id }}If the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% case symptom %}\n{% when \"no_power\" %}\nQuote the knowledge base passages you rely on, word for word.\n{% when \"flicker\" %}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% when \"dead_segment\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% when \"overheating\" %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"app_offline\" %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{% when \"physical_damage\" %}\nThe reply goes to the store chat, so plain text works best.\n{% endcase %}\n{% if purchased_on %}\nQuote the knowledge base passages you rely on, word for word. {{ purchased_on }}Answer in the customer's language and keep the tone calm and friendly.\n{% else %}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% endif %}\n{% if safety_risk %}\n{% include \"fragments/safety_escalation\" %}\n{% endif %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\n{{ intake_extra }}\nQuote the knowledge base passages you rely on, word for word.\n{% for policy in policies %}\n- {{ policy.title }}: {{ policy.text }}\n{% endfor %}\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-62ed2400b2374968409658ffd0d455e243f8a4f746fae5800eae4ec16e9d4292"
    },
    "analysis": {
      "variables": [
        "customer",
        "intake_extra",
        "order_id",
        "output_format",
        "policies",
        "policy",
        "purchased_on",
        "safety_risk",
        "symptom"
      ],
      "globals": [
        "customer",
        "intake_extra",
        "order_id",
        "output_format",
        "policies",
        "purchased_on",
        "safety_risk",
        "symptom"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "order_id",
        "type_id": "OrderId",
        "used": true
      },
      {
        "name": "symptom",
        "type_id": "DefectSymptom",
        "used": true
      },
      {
        "name": "purchased_on",
        "type_id": "Date?",
        "used": true
      },
      {
        "name": "safety_risk",
        "type_id": "Bool",
        "used": true
      },
      {
        "name": "intake_extra",
        "type_id": "Dynamic",
        "used": true
      },
      {
        "name": "policies",
        "type_id": "Policy[]",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/drafts__gemini": {
    "flow_id": "support_case",
    "node_id": "drafts__gemini",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system cache %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/brand_voice\" %}\n{% include \"fragments/citation_rules\" %}\n{% include \"fragments/untrusted_input\" %}\n{{ output_format }}\n{% endmessage %}\n{% message user %}\n{% case channel %}\n{% when \"storefront\" %}\nAnswer in the customer's language and keep the tone calm and friendly. Base every promise on the accepted decision and the knowledge base passages provided.\n{% when \"amazon\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"ozon\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% endcase %}\n{% case customer.tier %}\n{% when \"standard\" %}\nYou write a reply to a customer on behalf of the Lumen support team.\n{% when \"plus\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% when \"business\" %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endcase %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step. {{ locale }}.\n{% if product %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ product.name }}.\n{% endif %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{{ variants.lamp_guide }}\n{% case resolution.action %}\n{% when \"store_credit\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% when \"replacement\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"reship\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"advice\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% endcase %}\n{{ resolution.summary }}\n{% if resolution.credit %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ resolution.credit.amount_minor }} {{ resolution.credit.currency }}.\n{% endif %}\nThe reply goes to the store chat, so plain text works best.\n{% for chunk in chunks %}\n- {{ chunk.title }}: {{ chunk.text }}\n{% endfor %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{% if previous %}\nQuote the knowledge base passages you rely on, word for word.\n{{ previous.text }}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% for citation in previous.citations %}\n- {{ citation.quote }}\n{% endfor %}\n{% if critique %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{{ critique.rationale }}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for item in critique.blocking %}\n- {{ item }}\n{% endfor %}\n{% endif %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endif %}\n{% endmessage %}\n",
      "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3"
    },
    "analysis": {
      "variables": [
        "channel",
        "chunk",
        "chunks",
        "citation",
        "critique",
        "customer",
        "item",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "globals": [
        "channel",
        "chunks",
        "critique",
        "customer",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "locale",
        "type_id": "Locale",
        "used": true
      },
      {
        "name": "channel",
        "type_id": "Channel",
        "used": true
      },
      {
        "name": "product",
        "type_id": "ProductRef?",
        "used": true
      },
      {
        "name": "resolution",
        "type_id": "Resolution",
        "used": true
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": true
      },
      {
        "name": "previous",
        "type_id": "ReplyDraft?",
        "used": true
      },
      {
        "name": "critique",
        "type_id": "Critique?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md"
    ],
    "problems": []
  },
  "support_case/drafts__gpt": {
    "flow_id": "support_case",
    "node_id": "drafts__gpt",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system cache %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/brand_voice\" %}\n{% include \"fragments/citation_rules\" %}\n{% include \"fragments/untrusted_input\" %}\n{{ output_format }}\n{% endmessage %}\n{% message user %}\n{% case channel %}\n{% when \"storefront\" %}\nAnswer in the customer's language and keep the tone calm and friendly. Base every promise on the accepted decision and the knowledge base passages provided.\n{% when \"amazon\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"ozon\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% endcase %}\n{% case customer.tier %}\n{% when \"standard\" %}\nYou write a reply to a customer on behalf of the Lumen support team.\n{% when \"plus\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% when \"business\" %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endcase %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step. {{ locale }}.\n{% if product %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ product.name }}.\n{% endif %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{{ variants.lamp_guide }}\n{% case resolution.action %}\n{% when \"store_credit\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% when \"replacement\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"reship\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"advice\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% endcase %}\n{{ resolution.summary }}\n{% if resolution.credit %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ resolution.credit.amount_minor }} {{ resolution.credit.currency }}.\n{% endif %}\nThe reply goes to the store chat, so plain text works best.\n{% for chunk in chunks %}\n- {{ chunk.title }}: {{ chunk.text }}\n{% endfor %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{% if previous %}\nQuote the knowledge base passages you rely on, word for word.\n{{ previous.text }}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% for citation in previous.citations %}\n- {{ citation.quote }}\n{% endfor %}\n{% if critique %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{{ critique.rationale }}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for item in critique.blocking %}\n- {{ item }}\n{% endfor %}\n{% endif %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endif %}\n{% endmessage %}\n",
      "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3"
    },
    "analysis": {
      "variables": [
        "channel",
        "chunk",
        "chunks",
        "citation",
        "critique",
        "customer",
        "item",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "globals": [
        "channel",
        "chunks",
        "critique",
        "customer",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "locale",
        "type_id": "Locale",
        "used": true
      },
      {
        "name": "channel",
        "type_id": "Channel",
        "used": true
      },
      {
        "name": "product",
        "type_id": "ProductRef?",
        "used": true
      },
      {
        "name": "resolution",
        "type_id": "Resolution",
        "used": true
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": true
      },
      {
        "name": "previous",
        "type_id": "ReplyDraft?",
        "used": true
      },
      {
        "name": "critique",
        "type_id": "Critique?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md"
    ],
    "problems": []
  },
  "support_case/drafts__mistral": {
    "flow_id": "support_case",
    "node_id": "drafts__mistral",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system cache %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/brand_voice\" %}\n{% include \"fragments/citation_rules\" %}\n{% include \"fragments/untrusted_input\" %}\n{{ output_format }}\n{% endmessage %}\n{% message user %}\n{% case channel %}\n{% when \"storefront\" %}\nAnswer in the customer's language and keep the tone calm and friendly. Base every promise on the accepted decision and the knowledge base passages provided.\n{% when \"amazon\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"ozon\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% endcase %}\n{% case customer.tier %}\n{% when \"standard\" %}\nYou write a reply to a customer on behalf of the Lumen support team.\n{% when \"plus\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% when \"business\" %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endcase %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step. {{ locale }}.\n{% if product %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ product.name }}.\n{% endif %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{{ variants.lamp_guide }}\n{% case resolution.action %}\n{% when \"store_credit\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% when \"replacement\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"reship\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"advice\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% endcase %}\n{{ resolution.summary }}\n{% if resolution.credit %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ resolution.credit.amount_minor }} {{ resolution.credit.currency }}.\n{% endif %}\nThe reply goes to the store chat, so plain text works best.\n{% for chunk in chunks %}\n- {{ chunk.title }}: {{ chunk.text }}\n{% endfor %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{% if previous %}\nQuote the knowledge base passages you rely on, word for word.\n{{ previous.text }}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% for citation in previous.citations %}\n- {{ citation.quote }}\n{% endfor %}\n{% if critique %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{{ critique.rationale }}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for item in critique.blocking %}\n- {{ item }}\n{% endfor %}\n{% endif %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endif %}\n{% endmessage %}\n",
      "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3"
    },
    "analysis": {
      "variables": [
        "channel",
        "chunk",
        "chunks",
        "citation",
        "critique",
        "customer",
        "item",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "globals": [
        "channel",
        "chunks",
        "critique",
        "customer",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "locale",
        "type_id": "Locale",
        "used": true
      },
      {
        "name": "channel",
        "type_id": "Channel",
        "used": true
      },
      {
        "name": "product",
        "type_id": "ProductRef?",
        "used": true
      },
      {
        "name": "resolution",
        "type_id": "Resolution",
        "used": true
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": true
      },
      {
        "name": "previous",
        "type_id": "ReplyDraft?",
        "used": true
      },
      {
        "name": "critique",
        "type_id": "Critique?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md"
    ],
    "problems": []
  },
  "support_case/polish__critique": {
    "flow_id": "support_case",
    "node_id": "polish__critique",
    "inference_id": "critique",
    "level": 2,
    "path": "flows/support_case/nodes/polish/critique.prompt.md",
    "file_hash": "sha256-41207d1262130afbd5e0b0b72816c837d494b8b24a5442c5fd6658a734320ebf",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step. Do not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/judge_protocol\" %}\n{% include \"fragments/citation_rules\" %}\n{% include \"fragments/untrusted_input\" %}\n{% endmessage %}\n{% message user %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\nDo not promise compensation, refunds or credit that the decision does not include. {{ resolution.summary }}\nThe reply goes to the store chat, so plain text works best.\n{% for chunk in chunks %}\n- {{ chunk.chunk_id }}, {{ chunk.title }}: {{ chunk.text }}\n{% endfor %}\nAnswer in the customer's language and keep the tone calm and friendly.\n{{ reply.text }}\nThe reply goes to the store chat, so plain text works best.\n{% for citation in reply.citations %}\n- {{ citation.chunk_id }}: {{ citation.quote }}\n{% endfor %}\n{{ output_format }}\n{% endmessage %}\n",
      "file_hash": "sha256-41207d1262130afbd5e0b0b72816c837d494b8b24a5442c5fd6658a734320ebf"
    },
    "analysis": {
      "variables": [
        "chunk",
        "chunks",
        "citation",
        "output_format",
        "reply",
        "resolution",
        "summary"
      ],
      "globals": [
        "chunks",
        "output_format",
        "reply",
        "resolution",
        "summary"
      ],
      "filters": [],
      "tags": [
        "for",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "resolution",
        "type_id": "Resolution",
        "used": true
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": true
      },
      {
        "name": "reply",
        "type_id": "ReplyDraft",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "support_case/polish__revise": {
    "flow_id": "support_case",
    "node_id": "polish__revise",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "{% message system cache %}\nKeep the reply short: a greeting, the steps, the resolution and a sign-off. The reply goes to the store chat, so plain text works best.\n{% include \"fragments/brand_voice\" %}\n{% include \"fragments/citation_rules\" %}\n{% include \"fragments/untrusted_input\" %}\n{{ output_format }}\n{% endmessage %}\n{% message user %}\n{% case channel %}\n{% when \"storefront\" %}\nAnswer in the customer's language and keep the tone calm and friendly. Base every promise on the accepted decision and the knowledge base passages provided.\n{% when \"amazon\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"ozon\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% endcase %}\n{% case customer.tier %}\n{% when \"standard\" %}\nYou write a reply to a customer on behalf of the Lumen support team.\n{% when \"plus\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% when \"business\" %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endcase %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step. {{ locale }}.\n{% if product %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ product.name }}.\n{% endif %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{{ variants.lamp_guide }}\n{% case resolution.action %}\n{% when \"store_credit\" %}\nBase every promise on the accepted decision and the knowledge base passages provided.\n{% when \"replacement\" %}\nThe reply goes to the store chat, so plain text works best. You write a reply to a customer on behalf of the Lumen support team.\n{% when \"reship\" %}\nQuote the knowledge base passages you rely on, word for word. Keep the reply short: a greeting, the steps, the resolution and a sign-off.\n{% when \"advice\" %}\nDo not promise compensation, refunds or credit that the decision does not include. Quote the knowledge base passages you rely on, word for word.\n{% endcase %}\n{{ resolution.summary }}\n{% if resolution.credit %}\nAnswer in the customer's language and keep the tone calm and friendly. {{ resolution.credit.amount_minor }} {{ resolution.credit.currency }}.\n{% endif %}\nThe reply goes to the store chat, so plain text works best.\n{% for chunk in chunks %}\n- {{ chunk.title }}: {{ chunk.text }}\n{% endfor %}\nQuote the knowledge base passages you rely on, word for word.\n{{ summary }}\n</case_summary>\n{% if previous %}\nQuote the knowledge base passages you rely on, word for word.\n{{ previous.text }}\nAnswer in the customer's language and keep the tone calm and friendly.\n{% for citation in previous.citations %}\n- {{ citation.quote }}\n{% endfor %}\n{% if critique %}\nDo not promise compensation, refunds or credit that the decision does not include.\n{{ critique.rationale }}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% for item in critique.blocking %}\n- {{ item }}\n{% endfor %}\n{% endif %}\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\n{% endif %}\n{% endmessage %}\n",
      "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3"
    },
    "analysis": {
      "variables": [
        "channel",
        "chunk",
        "chunks",
        "citation",
        "critique",
        "customer",
        "item",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "globals": [
        "channel",
        "chunks",
        "critique",
        "customer",
        "locale",
        "output_format",
        "previous",
        "product",
        "resolution",
        "summary",
        "variants"
      ],
      "filters": [],
      "tags": [
        "case",
        "for",
        "if",
        "include",
        "message"
      ]
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": true
      },
      {
        "name": "customer",
        "type_id": "Customer",
        "used": true
      },
      {
        "name": "locale",
        "type_id": "Locale",
        "used": true
      },
      {
        "name": "channel",
        "type_id": "Channel",
        "used": true
      },
      {
        "name": "product",
        "type_id": "ProductRef?",
        "used": true
      },
      {
        "name": "resolution",
        "type_id": "Resolution",
        "used": true
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": true
      },
      {
        "name": "previous",
        "type_id": "ReplyDraft?",
        "used": true
      },
      {
        "name": "critique",
        "type_id": "Critique?",
        "used": true
      }
    ],
    "unused_inputs": [],
    "variant_files": [
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
      "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md"
    ],
    "problems": []
  },
  "support_case/illustrate": {
    "flow_id": "support_case",
    "node_id": "illustrate",
    "inference_id": "illustrate",
    "level": 3,
    "path": null,
    "file_hash": null,
    "builder_ref": "@root/flows/support_case/nodes/illustrate/illustrate.py:illustrate_prompt",
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": null,
    "analysis": null,
    "slots": [
      {
        "name": "text",
        "type_id": "Text",
        "used": false
      },
      {
        "name": "category",
        "type_id": "ProductCategory",
        "used": false
      },
      {
        "name": "photo",
        "type_id": "Image?",
        "used": false
      }
    ],
    "unused_inputs": [],
    "variant_files": [],
    "problems": []
  },
  "judge_panel/judges__deepseek": {
    "flow_id": "judge_panel",
    "node_id": "judges__deepseek",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "Quote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.\nYou write a reply to a customer on behalf of the Lumen support team.\nAnswer in the customer's language and keep the tone calm and friendly.\nBase every promise on the accepted decision and the knowledge base passages provided.\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\nDo not promise compensation, refunds or credit that the decision does not include.\nQuote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.",
      "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915"
    },
    "analysis": {
      "variables": [],
      "globals": [],
      "filters": [],
      "tags": []
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": false
      },
      {
        "name": "candidates",
        "type_id": "ReplyDraft[]",
        "used": false
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": false
      },
      {
        "name": "panel",
        "type_id": "JudgeVerdict[]?",
        "used": false
      }
    ],
    "unused_inputs": [
      "summary",
      "candidates",
      "chunks",
      "panel"
    ],
    "variant_files": [],
    "problems": []
  },
  "judge_panel/judges__llama": {
    "flow_id": "judge_panel",
    "node_id": "judges__llama",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "Quote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.\nYou write a reply to a customer on behalf of the Lumen support team.\nAnswer in the customer's language and keep the tone calm and friendly.\nBase every promise on the accepted decision and the knowledge base passages provided.\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\nDo not promise compensation, refunds or credit that the decision does not include.\nQuote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.",
      "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915"
    },
    "analysis": {
      "variables": [],
      "globals": [],
      "filters": [],
      "tags": []
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": false
      },
      {
        "name": "candidates",
        "type_id": "ReplyDraft[]",
        "used": false
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": false
      },
      {
        "name": "panel",
        "type_id": "JudgeVerdict[]?",
        "used": false
      }
    ],
    "unused_inputs": [
      "summary",
      "candidates",
      "chunks",
      "panel"
    ],
    "variant_files": [],
    "problems": []
  },
  "judge_panel/judges__qwen": {
    "flow_id": "judge_panel",
    "node_id": "judges__qwen",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "Quote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.\nYou write a reply to a customer on behalf of the Lumen support team.\nAnswer in the customer's language and keep the tone calm and friendly.\nBase every promise on the accepted decision and the knowledge base passages provided.\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\nDo not promise compensation, refunds or credit that the decision does not include.\nQuote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.",
      "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915"
    },
    "analysis": {
      "variables": [],
      "globals": [],
      "filters": [],
      "tags": []
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": false
      },
      {
        "name": "candidates",
        "type_id": "ReplyDraft[]",
        "used": false
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": false
      },
      {
        "name": "panel",
        "type_id": "JudgeVerdict[]?",
        "used": false
      }
    ],
    "unused_inputs": [
      "summary",
      "candidates",
      "chunks",
      "panel"
    ],
    "variant_files": [],
    "problems": []
  },
  "judge_panel/decide__tie_break": {
    "flow_id": "judge_panel",
    "node_id": "decide__tie_break",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0,
    "source": {
      "text": "Quote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.\nYou write a reply to a customer on behalf of the Lumen support team.\nAnswer in the customer's language and keep the tone calm and friendly.\nBase every promise on the accepted decision and the knowledge base passages provided.\nIf the request mentions heat, smoke, sparks or a burning smell, start with the safety step.\nDo not promise compensation, refunds or credit that the decision does not include.\nQuote the knowledge base passages you rely on, word for word.\nKeep the reply short: a greeting, the steps, the resolution and a sign-off.\nThe reply goes to the store chat, so plain text works best.",
      "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915"
    },
    "analysis": {
      "variables": [],
      "globals": [],
      "filters": [],
      "tags": []
    },
    "slots": [
      {
        "name": "summary",
        "type_id": "Text",
        "used": false
      },
      {
        "name": "candidates",
        "type_id": "ReplyDraft[]",
        "used": false
      },
      {
        "name": "chunks",
        "type_id": "KbChunk[]",
        "used": false
      },
      {
        "name": "panel",
        "type_id": "JudgeVerdict[]?",
        "used": false
      }
    ],
    "unused_inputs": [
      "summary",
      "candidates",
      "chunks",
      "panel"
    ],
    "variant_files": [],
    "problems": []
  }
}
