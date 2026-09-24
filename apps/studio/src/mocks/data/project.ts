import type { ApiFileEntry, ApiFlow, ApiFlowDetail, ApiProject, ApiPrompt, ApiProviderKey, ApiResearchBudget, ApiSecret, ApiSetting, ApiType, ApiTypeDetail } from "@/domain"

export const liveProject: ApiProject = {
  "root": "/Users/kirunya/Projects/my/ai-workflows-automate/examples/lumen",
  "package": "lumen",
  "engine_version": "0.0.0",
  "tree_hash": "sha256-51738bc48cb197f1fb49936cac7046b171fba364615557bc835fc8218aa74ad6",
  "project_file": {
    "path": "aqven.yaml",
    "file_hash": "sha256-550c02d247aeda3ac12c36b7f9054d7003479343efbd87e9d64ec6159bad5a7f"
  },
  "lock_file": null,
  "index": {
    "status": "ready",
    "generation": 1,
    "indexed_at": "2026-09-18T06:08:51.526651Z",
    "pending_files": 0
  },
  "problems": {
    "error": 0,
    "warning": 0,
    "info": 0
  },
  "quarantined_files": [],
  "spec_seq": 0,
  "mcp_url": "http://127.0.0.1:5183/mcp/"
}

export const liveFlows: readonly ApiFlow[] = [
  {
    "flow_id": "judge_panel",
    "root_path": "flows/judge_panel",
    "compile_status": "ok",
    "problems": {
      "error": 0,
      "warning": 0,
      "info": 0
    },
    "first_problem": null,
    "node_count": 8,
    "input_type": "PanelRequest",
    "output_type": "PanelOutcome",
    "context": [],
    "content_hash": "sha256-b683d1c10d685b049bc1122003aacba90522719427a6ce3943d6d27762ce7aff",
    "last_run": null
  },
  {
    "flow_id": "support_case",
    "root_path": "flows/support_case",
    "compile_status": "ok",
    "problems": {
      "error": 0,
      "warning": 0,
      "info": 0
    },
    "first_problem": null,
    "node_count": 30,
    "input_type": "CaseRequest",
    "output_type": "CaseOutcome",
    "context": [
      "date",
      "tenant_id"
    ],
    "content_hash": "sha256-a295839de05546980a05df242383a467a9b8f22d1503a08833267ae2a706f612",
    "last_run": {
      "run_id": "01a0b1a1-035d-7661-b565-397d04af47b7",
      "status": "failed",
      "started_at": "2026-09-17T23:08:34.527000Z"
    }
  }
]

export const liveFlowDetails: Readonly<Record<string, ApiFlowDetail>> = {
  "support_case": {
    "flow_id": "support_case",
    "root_path": "flows/support_case",
    "compile_status": "ok",
    "problems": {
      "error": 0,
      "warning": 0,
      "info": 0
    },
    "first_problem": null,
    "node_count": 30,
    "input_type": "CaseRequest",
    "output_type": "CaseOutcome",
    "context": [
      "date",
      "tenant_id"
    ],
    "content_hash": "sha256-a295839de05546980a05df242383a467a9b8f22d1503a08833267ae2a706f612",
    "last_run": {
      "run_id": "01a0b1a1-035d-7661-b565-397d04af47b7",
      "status": "failed",
      "started_at": "2026-09-17T23:08:34.527000Z"
    },
    "description": "Обращение покупателя Lumen: разбор вложений, намерение голосованием с каскадом, анкета с ремонтом, решение, ответ по базе знаний с панелью судей и полировкой, медиа ответа и согласование людьми",
    "files": [
      {
        "path": "flows/support_case/flow.yaml",
        "file_hash": "sha256-975618e3012b23836d0ee569b0c57ff05c9deacc4d926902126292a414798f18"
      },
      {
        "path": "flows/support_case/nodes/approvals/approvals.node.yaml",
        "file_hash": "sha256-b8f395ac82baeafe8142244cdd0cc2e2ac06a9e76ef82683595f2f8570eed173"
      },
      {
        "path": "flows/support_case/nodes/approvals/brand.node.yaml",
        "file_hash": "sha256-aed3e2b05fb07d76622275721511b35321bc6b916e061fd93fad1d5701db9a44"
      },
      {
        "path": "flows/support_case/nodes/approvals/lead.node.yaml",
        "file_hash": "sha256-4f0b1c0b4eb42cccd95daaf22d9b5fda711aaa8133502a5aa0ed7a5e39ab5654"
      },
      {
        "path": "flows/support_case/nodes/case_form/case_form.node.yaml",
        "file_hash": "sha256-90576e9bc6179fe61310dd6573ea8e7b65128348dea415ebe7c9d6752f9f4d75"
      },
      {
        "path": "flows/support_case/nodes/case_form/case_form.py",
        "file_hash": "sha256-5428752064a173f06d5aef523e3a7aaa53e0af6500ddafe7a4263efe604725eb"
      },
      {
        "path": "flows/support_case/nodes/clip/clip.node.yaml",
        "file_hash": "sha256-d3bcea188e861cc352b99278500878df24a18771870d196b5e3082b1dbf7e930"
      },
      {
        "path": "flows/support_case/nodes/drafts/drafts.node.yaml",
        "file_hash": "sha256-d7194be6c4d80ada540971f669feb66c61cbbe06503f089535f55fb0d4747dd0"
      },
      {
        "path": "flows/support_case/nodes/drafts/gemini.node.yaml",
        "file_hash": "sha256-caccd279f71b8fb5a7eff5875f71fe8775cf0d9cd0040205bacf87476fa8abcf"
      },
      {
        "path": "flows/support_case/nodes/drafts/gpt.node.yaml",
        "file_hash": "sha256-760f93cf6338d438ada145e99bf7b21f53a04c8f9cb571ed5b2cf3635480722e"
      },
      {
        "path": "flows/support_case/nodes/drafts/mistral.node.yaml",
        "file_hash": "sha256-a7edbeaf132d2070fde825ad82552025381b84ef49a4afb78955e1ac49323be6"
      },
      {
        "path": "flows/support_case/nodes/finalize/finalize.node.yaml",
        "file_hash": "sha256-bb012d748e560afe2b07ee8f1c5f81d5b8662621d275c69d0c4d3016ced9e4b7"
      },
      {
        "path": "flows/support_case/nodes/finalize/finalize.py",
        "file_hash": "sha256-110b5d08ead1f4228e87761595983c0baab0d1e715f3eb0cd526f6cf6244c5b3"
      },
      {
        "path": "flows/support_case/nodes/illustrate/illustrate.inference.yaml",
        "file_hash": "sha256-5d5b885e27f9525268d0e07cd149be759d4fb20bd99820559770c0446c10ef38"
      },
      {
        "path": "flows/support_case/nodes/illustrate/illustrate.node.yaml",
        "file_hash": "sha256-777c77ad19d3aad96878062c9c6f5450e5bfb68c5034d22d7941ec74377ffa6f"
      },
      {
        "path": "flows/support_case/nodes/illustrate/illustrate.py",
        "file_hash": "sha256-47936088e2ac546e67a6fba9b30591e614adf32963326a743c41dc7b600121c0"
      },
      {
        "path": "flows/support_case/nodes/intent/escalate.node.yaml",
        "file_hash": "sha256-7872760a9f8faa55fbd0a5ba4d1fddd1e63237b553b513206f92db3ebe876d4b"
      },
      {
        "path": "flows/support_case/nodes/intent/intent.node.yaml",
        "file_hash": "sha256-be5319527d521bb4592a5a18d53ab58f95f569aab0af0fbbb915bb1140b8a87d"
      },
      {
        "path": "flows/support_case/nodes/panel/panel.node.yaml",
        "file_hash": "sha256-cb4bc6eed572bac3e04735b1a54876ca517d804592e0c7d52f199c6512d92fbf"
      },
      {
        "path": "flows/support_case/nodes/polish/critique.inference.yaml",
        "file_hash": "sha256-1a416f49d0a5c693ad38a9740b844f74b7748199a34c7a1ac99b6f9eeeda3648"
      },
      {
        "path": "flows/support_case/nodes/polish/critique.node.yaml",
        "file_hash": "sha256-b91d60ec112e78ae4632ec2afcab66ef91c3caad4a5cfdf33ef2f1dfc90345b0"
      },
      {
        "path": "flows/support_case/nodes/polish/critique.prompt.md",
        "file_hash": "sha256-41207d1262130afbd5e0b0b72816c837d494b8b24a5442c5fd6658a734320ebf"
      },
      {
        "path": "flows/support_case/nodes/polish/critique.py",
        "file_hash": "sha256-5d628fa7a9f38e7a7cf3ae4ea6bbeb29f9803baa8bca26c61b209d7d419225ee"
      },
      {
        "path": "flows/support_case/nodes/polish/polish.node.yaml",
        "file_hash": "sha256-ca0c70d1ebfcea7dd1c7d41c8f4512d0b09ce2b359bf9e8697d5b0cc1ac770a6"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.inference.yaml",
        "file_hash": "sha256-7d54e59255c030d069cc86b56481b7555ab02af5af1359620ef04f3c29492d8e"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.node.yaml",
        "file_hash": "sha256-fa6a367b5d267159998dea1887cf0e9ca9159b67b403fe5b072d5a63a5b0c012"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.prompt.md",
        "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
        "file_hash": "sha256-fa7aa09dc9b872113141abbd53cf68782bb58f3a043a7f629faa7a2b2225f663"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
        "file_hash": "sha256-0e9e7b0453dcc159703a1d4e4d4333ba0845c6a2dd0896665584d34780cf2967"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
        "file_hash": "sha256-4b8f1d9268836feca859b66113d858b1f6d25deb27df54e8263946c51dbeedd7"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
        "file_hash": "sha256-c3247ef5581f9ec4fdfc5ec79a85464b03a35bb8316813879c356d5d2ab47472"
      },
      {
        "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md",
        "file_hash": "sha256-23082b297933ced54dcb27f3412467417472d73fc4ad38d4317ea28b7b62b205"
      },
      {
        "path": "flows/support_case/nodes/prepare/prepare.node.yaml",
        "file_hash": "sha256-fb570108db483fcd0da975bd9d70d82c8b183f7b678fbd0f6be91afd7a7e936a"
      },
      {
        "path": "flows/support_case/nodes/prepare/prepare.py",
        "file_hash": "sha256-5e159a6ce215cbf081c5e51527661974344487191adefca68d0c3eb9247dc3ea"
      },
      {
        "path": "flows/support_case/nodes/record/extract.inference.yaml",
        "file_hash": "sha256-5e4dbfbe765e5a7406971f233a5001846cd364efc394f449e5a77f3dab8455ef"
      },
      {
        "path": "flows/support_case/nodes/record/extract.node.yaml",
        "file_hash": "sha256-8731f49c57195682086c20fd0da5144b1f4adab7c3cf399a739412b08d94d095"
      },
      {
        "path": "flows/support_case/nodes/record/extract.prompt.md",
        "file_hash": "sha256-d8ec2a342c2466fb4df8a0ac551917325543de607963692e92bc7de8d9bca988"
      },
      {
        "path": "flows/support_case/nodes/record/record.node.yaml",
        "file_hash": "sha256-5334e95a024a1f16910ad2f0f0f5076672c634434cad01d3d9ad9f35b2d91876"
      },
      {
        "path": "flows/support_case/nodes/record/record.py",
        "file_hash": "sha256-d689dba6cd46e885744a1769bc8889e7f5e214587fcaf954e29a0a2ee9dd86cb"
      },
      {
        "path": "flows/support_case/nodes/record/validate.node.yaml",
        "file_hash": "sha256-04b0f0663ffce28aadd370588531a246ecea5f319dc26a5f03a5319c991737df"
      },
      {
        "path": "flows/support_case/nodes/record/validate.py",
        "file_hash": "sha256-67c4d4789c7dc33aff9a58b919894586830e62be0fb65a8046fe8cf24dc82ce1"
      },
      {
        "path": "flows/support_case/nodes/route/resolve.inference.yaml",
        "file_hash": "sha256-b9d9421b7b8fd158ad6b28836367ff7fec7f6b9b6e84097fd4fe2fd7b57ec62e"
      },
      {
        "path": "flows/support_case/nodes/route/resolve.node.yaml",
        "file_hash": "sha256-f302979b3b36c34e17375e5bf48459638d5e8ef3cc6350b20747a9d0de820f46"
      },
      {
        "path": "flows/support_case/nodes/route/resolve.prompt.md",
        "file_hash": "sha256-62ed2400b2374968409658ffd0d455e243f8a4f746fae5800eae4ec16e9d4292"
      },
      {
        "path": "flows/support_case/nodes/route/route.node.yaml",
        "file_hash": "sha256-8d8cc9abd4c2c5a766d6fb70351be723c93f092a05611228bffa19a98b5754bf"
      },
      {
        "path": "flows/support_case/nodes/search_kb/search_kb.node.yaml",
        "file_hash": "sha256-7baaee145191cab3bb53cf16e51982594c3bdabcfdf8abd8c43c86474c4d2aba"
      },
      {
        "path": "flows/support_case/nodes/tally/tally.node.yaml",
        "file_hash": "sha256-27065faeab27ac482f04bcdf21e3f24dce4367b614a65870b837cf36e00505b9"
      },
      {
        "path": "flows/support_case/nodes/tally/tally.py",
        "file_hash": "sha256-945b02f8c6aa9d3380675c9fd726def6caeaf89e7b773811adbf43f07c8077c7"
      },
      {
        "path": "flows/support_case/nodes/to_record/to_record.node.yaml",
        "file_hash": "sha256-edd18b6f2e4d0ac0c694cc87ce9c2db40fae757283ef3120aaac1f643f083548"
      },
      {
        "path": "flows/support_case/nodes/triage/triage.inference.yaml",
        "file_hash": "sha256-2306d2fb479c0b505920b8db491b91167fdc27acab2ec1396bc75e23621a8423"
      },
      {
        "path": "flows/support_case/nodes/triage/triage.node.yaml",
        "file_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e"
      },
      {
        "path": "flows/support_case/nodes/triage/triage.prompt.md",
        "file_hash": "sha256-98f86b6b94d66ac1601a03ffa670fe98ec929c9d7ccbb41b8f1b2f3cef2047ba"
      },
      {
        "path": "flows/support_case/nodes/voice/voice.node.yaml",
        "file_hash": "sha256-87dd43f80f97c86eeacd5c0299b5130ed0d2a15ddda773f645aa625e8e2d8e97"
      },
      {
        "path": "flows/support_case/nodes/vote/ballot.inference.yaml",
        "file_hash": "sha256-c32b4aabe34510fb0895e459ae8c29cc7a301ce92f71ccbb90d2f2a37b2960dc"
      },
      {
        "path": "flows/support_case/nodes/vote/ballot.node.yaml",
        "file_hash": "sha256-1bb2cf29e4d12f3d60f4e993a7b0f38450ec5aaac26512784f9c7a0d3277d5b0"
      },
      {
        "path": "flows/support_case/nodes/vote/ballot.prompt.md",
        "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95"
      },
      {
        "path": "flows/support_case/nodes/vote/vote.node.yaml",
        "file_hash": "sha256-71d08645a7701a30876818ead07a0f6133fd3d9d261af7fab4be8ffe1c6d9444"
      }
    ],
    "tree_hash": "sha256-51738bc48cb197f1fb49936cac7046b171fba364615557bc835fc8218aa74ad6",
    "order": [
      "prepare",
      "triage",
      "vote",
      "tally",
      "intent",
      "case_form",
      "record",
      "to_record",
      "search_kb",
      "route",
      "drafts",
      "panel",
      "polish",
      "illustrate",
      "voice",
      "clip",
      "approvals",
      "finalize"
    ],
    "diagnostics": [],
    "layout_rev": null
  },
  "judge_panel": {
    "flow_id": "judge_panel",
    "root_path": "flows/judge_panel",
    "compile_status": "ok",
    "problems": {
      "error": 0,
      "warning": 0,
      "info": 0
    },
    "first_problem": null,
    "node_count": 8,
    "input_type": "PanelRequest",
    "output_type": "PanelOutcome",
    "context": [],
    "content_hash": "sha256-b683d1c10d685b049bc1122003aacba90522719427a6ce3943d6d27762ce7aff",
    "last_run": null,
    "description": "Панель судей трёх семейств, отличных от авторов: вердикты, согласие, тай-брейк моделью OpenAI, победитель",
    "files": [
      {
        "path": "flows/judge_panel/flow.yaml",
        "file_hash": "sha256-695c47fefc5617a4c48a6eff6fb8cf0cfaf3bef86a75a95bbbf64f4cb4bbbd52"
      },
      {
        "path": "flows/judge_panel/nodes/aggregate/aggregate.node.yaml",
        "file_hash": "sha256-93b880494e96aa3dd8cea16bbac82dd7bd4d72e6d1f7052931e930a851337a05"
      },
      {
        "path": "flows/judge_panel/nodes/aggregate/aggregate.py",
        "file_hash": "sha256-1006fab288aa69b1352915aa5c85f153712c4951d6d04f9328eac7e53edc5494"
      },
      {
        "path": "flows/judge_panel/nodes/decide/decide.node.yaml",
        "file_hash": "sha256-589a2bc0409675d0e2ceeac1c201fae2e8d94682d4a4e666b40c1a70578be890"
      },
      {
        "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml",
        "file_hash": "sha256-afe8697f9d067b2d55f6cc1e90e7cbde3a02c87e9d7fc4cbad3682ee17027a56"
      },
      {
        "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml",
        "file_hash": "sha256-81fb8b71270ea35be4aa1ec967bc6c70d6bbc1eda4039e191f0ef250c0386482"
      },
      {
        "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
        "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915"
      },
      {
        "path": "flows/judge_panel/nodes/judges/deepseek.node.yaml",
        "file_hash": "sha256-2f3a0976c6904c5f1984fd312fad2eaa6f6729b81bb3c15045eb8f0436ee6a8a"
      },
      {
        "path": "flows/judge_panel/nodes/judges/judges.node.yaml",
        "file_hash": "sha256-b3308f7dff98724a5b43329557f231cb8644dfb8c2756505f76570f21b47345e"
      },
      {
        "path": "flows/judge_panel/nodes/judges/judges.py",
        "file_hash": "sha256-30692dccfc328c5a7e6c268d5a88248adfafd1066f566a5551f5aca37c9a8e4c"
      },
      {
        "path": "flows/judge_panel/nodes/judges/llama.node.yaml",
        "file_hash": "sha256-fcfebea38f135ccf937ecb6e104f725dbabf01aa070d351ea9bf09681433d81c"
      },
      {
        "path": "flows/judge_panel/nodes/judges/qwen.node.yaml",
        "file_hash": "sha256-0007309b338a4ce082539dbd4ba9c4d3313f102f3c5973aa980d6715390e503b"
      },
      {
        "path": "flows/judge_panel/nodes/pick/pick.node.yaml",
        "file_hash": "sha256-95b4e3e2f96a904f16c9072275facbd0ffcbdb84803ba97541637968dd1c2983"
      },
      {
        "path": "flows/judge_panel/nodes/pick/pick.py",
        "file_hash": "sha256-9da1fb959ae8fae9d9cdcbe46969f96be9f0a32961bd6531123453225c232f13"
      }
    ],
    "tree_hash": "sha256-51738bc48cb197f1fb49936cac7046b171fba364615557bc835fc8218aa74ad6",
    "order": [
      "judges",
      "aggregate",
      "decide",
      "pick"
    ],
    "diagnostics": [],
    "layout_rev": null
  }
}

export const liveTypes: readonly ApiType[] = [
  {
    "type_id": "Agreement",
    "path": "types/enums/agreement.yaml",
    "kind": "enum",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "ApprovalDecision",
    "path": "types/enums/approval_decision.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "CascadeTier",
    "path": "types/enums/cascade_tier.yaml",
    "kind": "enum",
    "usage_count": 4,
    "status": "ok"
  },
  {
    "type_id": "CaseIntent",
    "path": "types/enums/case_intent.yaml",
    "kind": "enum",
    "usage_count": 8,
    "status": "ok"
  },
  {
    "type_id": "CaseOrigin",
    "path": "types/unions/case_origin.yaml",
    "kind": "union",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "CaseOutcome",
    "path": "types/records/case_outcome.yaml",
    "kind": "record",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "CaseRecord",
    "path": "types/unions/case_record.yaml",
    "kind": "union",
    "usage_count": 4,
    "status": "ok"
  },
  {
    "type_id": "CaseRequest",
    "path": "types/records/case_request.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "CaseStatus",
    "path": "types/enums/case_status.yaml",
    "kind": "enum",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "Channel",
    "path": "types/enums/channel.yaml",
    "kind": "enum",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "Citation",
    "path": "types/records/citation.yaml",
    "kind": "record",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "CriterionScore",
    "path": "types/records/criterion_score.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "Critique",
    "path": "types/records/critique.yaml",
    "kind": "record",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "CurrencyCode",
    "path": "types/enums/currency_code.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "Customer",
    "path": "types/records/customer.yaml",
    "kind": "record",
    "usage_count": 4,
    "status": "ok"
  },
  {
    "type_id": "CustomerId",
    "path": "types/ids/customer_id.yaml",
    "kind": "id",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "CustomerTier",
    "path": "types/enums/customer_tier.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "DefectSymptom",
    "path": "types/enums/defect_symptom.yaml",
    "kind": "enum",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "DeliveryDamage",
    "path": "types/enums/delivery_damage.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "IntentBallot",
    "path": "types/records/intent_ballot.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "Issue",
    "path": "types/records/issue.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "IssueSeverity",
    "path": "types/enums/issue_severity.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "JudgeVerdict",
    "path": "types/records/judge_verdict.yaml",
    "kind": "record",
    "usage_count": 7,
    "status": "ok"
  },
  {
    "type_id": "KbChunk",
    "path": "types/records/kb_chunk.yaml",
    "kind": "record",
    "usage_count": 5,
    "status": "ok"
  },
  {
    "type_id": "KbChunkId",
    "path": "types/ids/kb_chunk_id.yaml",
    "kind": "id",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "LampKind",
    "path": "types/enums/lamp_kind.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "Marketplace",
    "path": "types/enums/marketplace.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "MediaApproval",
    "path": "types/records/media_approval.yaml",
    "kind": "record",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "Money",
    "path": "types/records/money.yaml",
    "kind": "record",
    "usage_count": 4,
    "status": "ok"
  },
  {
    "type_id": "Observation",
    "path": "types/records/observation.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "OrderId",
    "path": "types/ids/order_id.yaml",
    "kind": "id",
    "usage_count": 8,
    "status": "ok"
  },
  {
    "type_id": "PanelOutcome",
    "path": "types/records/panel_outcome.yaml",
    "kind": "record",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "PanelRequest",
    "path": "types/records/panel_request.yaml",
    "kind": "record",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "PanelVerdict",
    "path": "types/records/panel_verdict.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "Policy",
    "path": "types/records/policy.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "PolicyId",
    "path": "types/ids/policy_id.yaml",
    "kind": "id",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "ProductCategory",
    "path": "types/enums/product_category.yaml",
    "kind": "enum",
    "usage_count": 5,
    "status": "ok"
  },
  {
    "type_id": "ProductRef",
    "path": "types/records/product_ref.yaml",
    "kind": "record",
    "usage_count": 4,
    "status": "ok"
  },
  {
    "type_id": "ReplyApproval",
    "path": "types/records/reply_approval.yaml",
    "kind": "record",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "ReplyCriterion",
    "path": "types/enums/reply_criterion.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "ReplyDraft",
    "path": "types/records/reply_draft.yaml",
    "kind": "record",
    "usage_count": 14,
    "status": "ok"
  },
  {
    "type_id": "ReplyMedia",
    "path": "types/records/reply_media.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "Resolution",
    "path": "types/records/resolution.yaml",
    "kind": "record",
    "usage_count": 8,
    "status": "ok"
  },
  {
    "type_id": "ResolutionAction",
    "path": "types/enums/resolution_action.yaml",
    "kind": "enum",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "Score",
    "path": "types/values/score.yaml",
    "kind": "value",
    "usage_count": 7,
    "status": "ok"
  },
  {
    "type_id": "SignalDef",
    "path": "types/records/signal_def.yaml",
    "kind": "record",
    "usage_count": 2,
    "status": "ok"
  },
  {
    "type_id": "SignalKey",
    "path": "types/ids/signal_key.yaml",
    "kind": "id",
    "usage_count": 3,
    "status": "ok"
  },
  {
    "type_id": "SkuId",
    "path": "types/ids/sku_id.yaml",
    "kind": "id",
    "usage_count": 1,
    "status": "ok"
  },
  {
    "type_id": "VotePerspective",
    "path": "types/enums/vote_perspective.yaml",
    "kind": "enum",
    "usage_count": 2,
    "status": "ok"
  }
]

export const liveTypeDetails: Readonly<Record<string, ApiTypeDetail>> = {
  "ReplyApproval": {
    "type_id": "ReplyApproval",
    "path": "types/records/reply_approval.yaml",
    "file_hash": "sha256-ca3c5ecd579bf9220f91e6c84a727cb9283a6be79f5ea6e4246b1b262e41d842",
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Type",
      "type": "record",
      "description": "Согласование ответа руководителем поддержки",
      "pii": "none",
      "fields": [
        {
          "name": "decision",
          "type": "ApprovalDecision",
          "description": "Решение по ответу",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        },
        {
          "name": "edited_text",
          "type": "Text?",
          "description": "Исправленный текст при правке; иначе null",
          "maxLength": 1500,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        },
        {
          "name": "note",
          "type": "Text?",
          "description": "Заметка руководителя; null, если заметки нет",
          "maxLength": 400,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        }
      ]
    },
    "json_schema": {
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
    "enum_values": []
  },
  "MediaApproval": {
    "type_id": "MediaApproval",
    "path": "types/records/media_approval.yaml",
    "file_hash": "sha256-c0f88c32f80864df713e8d8a5b9922931889c620d28545a1d4aab4bf2914b613",
    "spec": {
      "apiVersion": "aqven/v1",
      "kind": "Type",
      "type": "record",
      "description": "Согласование медиа ответа бренд-редактором",
      "pii": "none",
      "fields": [
        {
          "name": "use_image",
          "type": "Bool",
          "description": "Приложить картинку-инструкцию",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        },
        {
          "name": "use_voice",
          "type": "Bool",
          "description": "Приложить голосовую версию ответа",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        },
        {
          "name": "use_clip",
          "type": "Bool",
          "description": "Приложить короткий ролик",
          "maxLength": null,
          "maxItems": null,
          "minimum": null,
          "maximum": null,
          "pattern": null,
          "enum": null
        }
      ]
    },
    "json_schema": {
      "additionalProperties": false,
      "properties": {
        "use_image": {
          "type": "boolean"
        },
        "use_voice": {
          "type": "boolean"
        },
        "use_clip": {
          "type": "boolean"
        }
      },
      "required": [
        "use_image",
        "use_voice",
        "use_clip"
      ],
      "type": "object"
    },
    "enum_values": []
  }
}

export const livePrompts: readonly ApiPrompt[] = [
  {
    "flow_id": "judge_panel",
    "node_id": "decide__tie_break",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "judge_panel",
    "node_id": "judges__deepseek",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "judge_panel",
    "node_id": "judges__llama",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "judge_panel",
    "node_id": "judges__qwen",
    "inference_id": "tie_break",
    "level": 1,
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "drafts__gemini",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "drafts__gpt",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "drafts__mistral",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "illustrate",
    "inference_id": "illustrate",
    "level": 3,
    "path": null,
    "file_hash": null,
    "builder_ref": "@root/flows/support_case/nodes/illustrate/illustrate.py:illustrate_prompt",
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "intent__escalate",
    "inference_id": "ballot",
    "level": 2,
    "path": "flows/support_case/nodes/vote/ballot.prompt.md",
    "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "polish__critique",
    "inference_id": "critique",
    "level": 2,
    "path": "flows/support_case/nodes/polish/critique.prompt.md",
    "file_hash": "sha256-41207d1262130afbd5e0b0b72816c837d494b8b24a5442c5fd6658a734320ebf",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "polish__revise",
    "inference_id": "revise",
    "level": 2,
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "record__extract",
    "inference_id": "extract",
    "level": 2,
    "path": "flows/support_case/nodes/record/extract.prompt.md",
    "file_hash": "sha256-d8ec2a342c2466fb4df8a0ac551917325543de607963692e92bc7de8d9bca988",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "route__resolve",
    "inference_id": "resolve",
    "level": 2,
    "path": "flows/support_case/nodes/route/resolve.prompt.md",
    "file_hash": "sha256-62ed2400b2374968409658ffd0d455e243f8a4f746fae5800eae4ec16e9d4292",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "triage",
    "inference_id": "triage",
    "level": 2,
    "path": "flows/support_case/nodes/triage/triage.prompt.md",
    "file_hash": "sha256-98f86b6b94d66ac1601a03ffa670fe98ec929c9d7ccbb41b8f1b2f3cef2047ba",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  },
  {
    "flow_id": "support_case",
    "node_id": "vote__ballot",
    "inference_id": "ballot",
    "level": 2,
    "path": "flows/support_case/nodes/vote/ballot.prompt.md",
    "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95",
    "builder_ref": null,
    "has_draft": false,
    "draft_stale": false,
    "problems_count": 0
  }
]

export const liveProviders: readonly ApiProviderKey[] = [
  {
    "provider": "openai",
    "setting_key": "providers.openai.api_key",
    "env_var": "OPENAI_API_KEY",
    "declared": false,
    "source": null,
    "masked": null
  },
  {
    "provider": "anthropic",
    "setting_key": "providers.anthropic.api_key",
    "env_var": "ANTHROPIC_API_KEY",
    "declared": false,
    "source": null,
    "masked": null
  },
  {
    "provider": "google",
    "setting_key": "providers.google.api_key",
    "env_var": "GOOGLE_API_KEY",
    "declared": false,
    "source": null,
    "masked": null
  },
  {
    "provider": "openrouter",
    "setting_key": "providers.openrouter.api_key",
    "env_var": "OPENROUTER_API_KEY",
    "declared": true,
    "source": "dotenv",
    "masked": "••••0860"
  },
  {
    "provider": "together",
    "setting_key": "providers.together.api_key",
    "env_var": "TOGETHER_API_KEY",
    "declared": false,
    "source": null,
    "masked": null
  }
]

export const liveSecrets: readonly ApiSecret[] = [
  {
    "name": "api_key",
    "env_var": "OPENROUTER_API_KEY",
    "declared_by": "openrouter",
    "scope": "provider",
    "declared_in": "aqven.yaml",
    "setting_key": "providers.openrouter.api_key",
    "source": "dotenv",
    "masked": "••••0860",
    "set": true
  },
  {
    "name": "orders_token",
    "env_var": "LUMEN_ORDERS_TOKEN",
    "declared_by": "issue_store_credit",
    "scope": "tool",
    "declared_in": "tools/issue_store_credit.yaml",
    "setting_key": "secrets.lumen_orders_token",
    "source": null,
    "masked": null,
    "set": false
  },
  {
    "name": "orders_token",
    "env_var": "LUMEN_ORDERS_TOKEN",
    "declared_by": "lookup_order",
    "scope": "tool",
    "declared_in": "tools/lookup_order.yaml",
    "setting_key": "secrets.lumen_orders_token",
    "source": null,
    "masked": null,
    "set": false
  },
  {
    "name": "together_api_key",
    "env_var": "TOGETHER_API_KEY",
    "declared_by": "render_clip",
    "scope": "tool",
    "declared_in": "tools/render_clip.yaml",
    "setting_key": "providers.together.api_key",
    "source": null,
    "masked": null,
    "set": false
  },
  {
    "name": "kb_token",
    "env_var": "LUMEN_KB_TOKEN",
    "declared_by": "search_kb",
    "scope": "tool",
    "declared_in": "tools/search_kb.yaml",
    "setting_key": "secrets.lumen_kb_token",
    "source": null,
    "masked": null,
    "set": false
  },
  {
    "name": "openai_api_key",
    "env_var": "OPENAI_API_KEY",
    "declared_by": "synthesize_voice",
    "scope": "tool",
    "declared_in": "tools/synthesize_voice.yaml",
    "setting_key": "providers.openai.api_key",
    "source": null,
    "masked": null,
    "set": false
  },
  {
    "name": "Authorization",
    "env_var": "LUMEN_HELPDESK_TOKEN",
    "declared_by": "helpdesk",
    "scope": "mcp_server",
    "declared_in": "mcp/helpdesk.yaml",
    "setting_key": "secrets.lumen_helpdesk_token",
    "source": null,
    "masked": null,
    "set": false
  }
]

export const liveResearchBudget: ApiResearchBudget = {
  "spend_cap_usd": "1.00",
  "source": "project",
  "project_usd": "1.00",
  "default_usd": "1.00",
  "override_problem": null,
  "project_file": liveProject.project_file
}

export const liveProjectSettings: readonly ApiSetting[] = [
  {
    "scope": "project",
    "key": "providers.openrouter.api_key",
    "kind": "secret",
    "value": null,
    "masked": "••••0860",
    "env_var": "OPENROUTER_API_KEY",
    "updated_at": "2026-09-18T06:08:51.526651Z"
  }
]

export const liveFiles: readonly ApiFileEntry[] = [
  {
    "path": "__init__.py",
    "kind": "code",
    "file_hash": "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "size_bytes": 0,
    "mtime_ns": 1789577146891284200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "__main__.py",
    "kind": "code",
    "file_hash": "sha256-74a87cf2d4d092e4bac126a97c3d74d03996ddd04c407d0a8fb10b1dcde26eb4",
    "size_bytes": 523,
    "mtime_ns": 1789676084975739600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/deepseek.yaml",
    "kind": "Agent",
    "file_hash": "sha256-5203cb8abd786dbc0c20296fad5df2ef3ecef368064b7babca4973168877e40e",
    "size_bytes": 314,
    "mtime_ns": 1789663676892067600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/gemini.yaml",
    "kind": "Agent",
    "file_hash": "sha256-7569df32ce72e2a8c4fa1caf0d3ad2b2f5e7e2b61e0edb7fd85acc9ba077cb20",
    "size_bytes": 346,
    "mtime_ns": 1789677072982836500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/gpt.yaml",
    "kind": "Agent",
    "file_hash": "sha256-cbe2748d05bd0e75e5f2ddfa0460e984e1aeb05eefd7a8f1f9ed363c796ae85a",
    "size_bytes": 323,
    "mtime_ns": 1789665966849042400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/llama.yaml",
    "kind": "Agent",
    "file_hash": "sha256-b5e7d704d33eb9983fb0772646aa902f406a2b646c3d8fe3418a7295cd319228",
    "size_bytes": 310,
    "mtime_ns": 1789663676896772600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/mistral.yaml",
    "kind": "Agent",
    "file_hash": "sha256-6825d64065c154dcfd9e80cef8aeceb6d3c9ec16dc4f74b096a3bed858027bc6",
    "size_bytes": 269,
    "mtime_ns": 1789663676889778000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/painter.yaml",
    "kind": "Agent",
    "file_hash": "sha256-b01e295351b9d645f5d83e509188df8ff73c08a6295cd4a3eefa81f4ea915319",
    "size_bytes": 337,
    "mtime_ns": 1789677072983031000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/qwen.yaml",
    "kind": "Agent",
    "file_hash": "sha256-b44e8a4bd91c90a2dc747bebfdf2ec08a8ce91cb65210f2cc6eb28f969120605",
    "size_bytes": 238,
    "mtime_ns": 1789663676893787400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/researcher.yaml",
    "kind": "Agent",
    "file_hash": "sha256-bd389f06a38e9da703bae90db53ed5a194cef173f018c05c75c8fea1759b069c",
    "size_bytes": 270,
    "mtime_ns": 1789663676900307000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/resolver/research_policy.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-58bab28b14cbb63d28b48da47fa076f0f5b493aeb2127baaef3bce023be73a95",
    "size_bytes": 883,
    "mtime_ns": 1789643815165610500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/resolver/research_policy.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-4638e46ff542b5b1113b6cde0af46e723a434db1e9fe8b2468d86c72574422da",
    "size_bytes": 922,
    "mtime_ns": 1789642570920227600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/resolver/resolver.instructions.md",
    "kind": "prompt",
    "file_hash": "sha256-f0e8a54b95bf69ba5967f66508788681dfc88428c7093a7623bec331fa0d2e1d",
    "size_bytes": 1793,
    "mtime_ns": 1789627566907921400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "agents/resolver/resolver.yaml",
    "kind": "Agent",
    "file_hash": "sha256-63b0764d73be67331a13de99a29bbdf7520e1cc1e16642ea291754694a005605",
    "size_bytes": 890,
    "mtime_ns": 1789665993820424400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "app.py",
    "kind": "code",
    "file_hash": "sha256-9a6441e63b40c5096e00c0714b0cbcc126d470e549a28716a0f951c99190d347",
    "size_bytes": 1726,
    "mtime_ns": 1789676078974153200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "aqven.yaml",
    "kind": "Project",
    "file_hash": "sha256-550c02d247aeda3ac12c36b7f9054d7003479343efbd87e9d64ec6159bad5a7f",
    "size_bytes": 834,
    "mtime_ns": 1789663726681816800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "code/support_case.py",
    "kind": "code",
    "file_hash": "sha256-263324fade34ac792db5dc487696765e0d185b8fabe9bd2ce09aa34161eea0a1",
    "size_bytes": 2941,
    "mtime_ns": 1789660106561525800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/flow.yaml",
    "kind": "Flow",
    "file_hash": "sha256-695c47fefc5617a4c48a6eff6fb8cf0cfaf3bef86a75a95bbbf64f4cb4bbbd52",
    "size_bytes": 840,
    "mtime_ns": 1789663728413706200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/aggregate/aggregate.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-93b880494e96aa3dd8cea16bbac82dd7bd4d72e6d1f7052931e930a851337a05",
    "size_bytes": 867,
    "mtime_ns": 1789642691813159700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/aggregate/aggregate.py",
    "kind": "code",
    "file_hash": "sha256-1006fab288aa69b1352915aa5c85f153712c4951d6d04f9328eac7e53edc5494",
    "size_bytes": 1349,
    "mtime_ns": 1789660106563441700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/decide/decide.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-589a2bc0409675d0e2ceeac1c201fae2e8d94682d4a4e666b40c1a70578be890",
    "size_bytes": 727,
    "mtime_ns": 1789627501100853200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/decide/tie_break.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-afe8697f9d067b2d55f6cc1e90e7cbde3a02c87e9d7fc4cbad3682ee17027a56",
    "size_bytes": 1483,
    "mtime_ns": 1789632209205817300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/decide/tie_break.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-81fb8b71270ea35be4aa1ec967bc6c70d6bbc1eda4039e191f0ef250c0386482",
    "size_bytes": 381,
    "mtime_ns": 1789663728413808600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/decide/tie_break.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-c04d75396d65db203784f5426725ab9440c0e72ba9687e561790a10b053de915",
    "size_bytes": 1533,
    "mtime_ns": 1789627499402768400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/judges/deepseek.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-2f3a0976c6904c5f1984fd312fad2eaa6f6729b81bb3c15045eb8f0436ee6a8a",
    "size_bytes": 333,
    "mtime_ns": 1789643815150996000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/judges/judges.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-b3308f7dff98724a5b43329557f231cb8644dfb8c2756505f76570f21b47345e",
    "size_bytes": 459,
    "mtime_ns": 1789640871046715600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/judges/judges.py",
    "kind": "code",
    "file_hash": "sha256-30692dccfc328c5a7e6c268d5a88248adfafd1066f566a5551f5aca37c9a8e4c",
    "size_bytes": 862,
    "mtime_ns": 1789660106565222100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/judges/llama.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-fcfebea38f135ccf937ecb6e104f725dbabf01aa070d351ea9bf09681433d81c",
    "size_bytes": 326,
    "mtime_ns": 1789643815151574500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/judges/qwen.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-0007309b338a4ce082539dbd4ba9c4d3313f102f3c5973aa980d6715390e503b",
    "size_bytes": 325,
    "mtime_ns": 1789643815151308500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/pick/pick.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-95b4e3e2f96a904f16c9072275facbd0ffcbdb84803ba97541637968dd1c2983",
    "size_bytes": 1074,
    "mtime_ns": 1789640871044926500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/judge_panel/nodes/pick/pick.py",
    "kind": "code",
    "file_hash": "sha256-9da1fb959ae8fae9d9cdcbe46969f96be9f0a32961bd6531123453225c232f13",
    "size_bytes": 549,
    "mtime_ns": 1789660106566619100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/flow.yaml",
    "kind": "Flow",
    "file_hash": "sha256-975618e3012b23836d0ee569b0c57ff05c9deacc4d926902126292a414798f18",
    "size_bytes": 1143,
    "mtime_ns": 1789627439187388400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/approvals/approvals.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-b8f395ac82baeafe8142244cdd0cc2e2ac06a9e76ef82683595f2f8570eed173",
    "size_bytes": 596,
    "mtime_ns": 1789632274734049300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/approvals/brand.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-aed3e2b05fb07d76622275721511b35321bc6b916e061fd93fad1d5701db9a44",
    "size_bytes": 831,
    "mtime_ns": 1789627478505103400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/approvals/lead.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-4f0b1c0b4eb42cccd95daaf22d9b5fda711aaa8133502a5aa0ed7a5e39ab5654",
    "size_bytes": 870,
    "mtime_ns": 1789627478501579300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/case_form/case_form.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-90576e9bc6179fe61310dd6573ea8e7b65128348dea415ebe7c9d6752f9f4d75",
    "size_bytes": 466,
    "mtime_ns": 1789642654617756200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/case_form/case_form.py",
    "kind": "code",
    "file_hash": "sha256-5428752064a173f06d5aef523e3a7aaa53e0af6500ddafe7a4263efe604725eb",
    "size_bytes": 1755,
    "mtime_ns": 1789660106568270000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/clip/clip.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-d3bcea188e861cc352b99278500878df24a18771870d196b5e3082b1dbf7e930",
    "size_bytes": 351,
    "mtime_ns": 1789627478496155000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/drafts/drafts.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-d7194be6c4d80ada540971f669feb66c61cbbe06503f089535f55fb0d4747dd0",
    "size_bytes": 452,
    "mtime_ns": 1789663751150538200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/drafts/gemini.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-caccd279f71b8fb5a7eff5875f71fe8775cf0d9cd0040205bacf87476fa8abcf",
    "size_bytes": 574,
    "mtime_ns": 1789643815163476700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/drafts/gpt.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-760f93cf6338d438ada145e99bf7b21f53a04c8f9cb571ed5b2cf3635480722e",
    "size_bytes": 571,
    "mtime_ns": 1789643815162541800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/drafts/mistral.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-a7edbeaf132d2070fde825ad82552025381b84ef49a4afb78955e1ac49323be6",
    "size_bytes": 576,
    "mtime_ns": 1789663726682036500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/finalize/finalize.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-bb012d748e560afe2b07ee8f1c5f81d5b8662621d275c69d0c4d3016ced9e4b7",
    "size_bytes": 2623,
    "mtime_ns": 1789640884857110300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/finalize/finalize.py",
    "kind": "code",
    "file_hash": "sha256-110b5d08ead1f4228e87761595983c0baab0d1e715f3eb0cd526f6cf6244c5b3",
    "size_bytes": 1947,
    "mtime_ns": 1789660106576219100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/illustrate/illustrate.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-5d5b885e27f9525268d0e07cd149be759d4fb20bd99820559770c0446c10ef38",
    "size_bytes": 866,
    "mtime_ns": 1789640884862024200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/illustrate/illustrate.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-777c77ad19d3aad96878062c9c6f5450e5bfb68c5034d22d7941ec74377ffa6f",
    "size_bytes": 296,
    "mtime_ns": 1789636875808247000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/illustrate/illustrate.py",
    "kind": "code",
    "file_hash": "sha256-47936088e2ac546e67a6fba9b30591e614adf32963326a743c41dc7b600121c0",
    "size_bytes": 2372,
    "mtime_ns": 1789660106572422000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/intent/escalate.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-7872760a9f8faa55fbd0a5ba4d1fddd1e63237b553b513206f92db3ebe876d4b",
    "size_bytes": 371,
    "mtime_ns": 1789663726682142500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/intent/intent.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-be5319527d521bb4592a5a18d53ab58f95f569aab0af0fbbb915bb1140b8a87d",
    "size_bytes": 742,
    "mtime_ns": 1789627439219231000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/panel/panel.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-cb4bc6eed572bac3e04735b1a54876ca517d804592e0c7d52f199c6512d92fbf",
    "size_bytes": 323,
    "mtime_ns": 1789640884870621700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/critique.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-1a416f49d0a5c693ad38a9740b844f74b7748199a34c7a1ac99b6f9eeeda3648",
    "size_bytes": 1469,
    "mtime_ns": 1789640884867206400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/critique.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-b91d60ec112e78ae4632ec2afcab66ef91c3caad4a5cfdf33ef2f1dfc90345b0",
    "size_bytes": 420,
    "mtime_ns": 1789663726682230000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/critique.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-41207d1262130afbd5e0b0b72816c837d494b8b24a5442c5fd6658a734320ebf",
    "size_bytes": 1382,
    "mtime_ns": 1789644978121792000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/critique.py",
    "kind": "code",
    "file_hash": "sha256-5d628fa7a9f38e7a7cf3ae4ea6bbeb29f9803baa8bca26c61b209d7d419225ee",
    "size_bytes": 1465,
    "mtime_ns": 1789660106574958300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/polish.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-ca0c70d1ebfcea7dd1c7d41c8f4512d0b09ce2b359bf9e8697d5b0cc1ac770a6",
    "size_bytes": 1043,
    "mtime_ns": 1789632274751208700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-7d54e59255c030d069cc86b56481b7555ab02af5af1359620ef04f3c29492d8e",
    "size_bytes": 2694,
    "mtime_ns": 1789646837238274300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-fa6a367b5d267159998dea1887cf0e9ca9159b67b403fe5b072d5a63a5b0c012",
    "size_bytes": 590,
    "mtime_ns": 1789643815160753200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-fb06b08bd99deee1b3b6442400b818e176303237f9c5ae26f8f26cbcd05356d3",
    "size_bytes": 3664,
    "mtime_ns": 1789644978121609700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/mains.md",
    "kind": "prompt",
    "file_hash": "sha256-fa7aa09dc9b872113141abbd53cf68782bb58f3a043a7f629faa7a2b2225f663",
    "size_bytes": 425,
    "mtime_ns": 1789632223868636400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/rechargeable.md",
    "kind": "prompt",
    "file_hash": "sha256-0e9e7b0453dcc159703a1d4e4d4333ba0845c6a2dd0896665584d34780cf2967",
    "size_bytes": 409,
    "mtime_ns": 1789632223870055700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_wifi.md",
    "kind": "prompt",
    "file_hash": "sha256-4b8f1d9268836feca859b66113d858b1f6d25deb27df54e8263946c51dbeedd7",
    "size_bytes": 380,
    "mtime_ns": 1789632223871725000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/smart_zigbee.md",
    "kind": "prompt",
    "file_hash": "sha256-c3247ef5581f9ec4fdfc5ec79a85464b03a35bb8316813879c356d5d2ab47472",
    "size_bytes": 372,
    "mtime_ns": 1789632223873931500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/polish/revise.variants/lamp_guide/unknown.md",
    "kind": "prompt",
    "file_hash": "sha256-23082b297933ced54dcb27f3412467417472d73fc4ad38d4317ea28b7b62b205",
    "size_bytes": 336,
    "mtime_ns": 1789632223875735800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/prepare/prepare.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-fb570108db483fcd0da975bd9d70d82c8b183f7b678fbd0f6be91afd7a7e936a",
    "size_bytes": 1189,
    "mtime_ns": 1789640884852014800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/prepare/prepare.py",
    "kind": "code",
    "file_hash": "sha256-5e159a6ce215cbf081c5e51527661974344487191adefca68d0c3eb9247dc3ea",
    "size_bytes": 3244,
    "mtime_ns": 1789660106571058200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/extract.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-5e4dbfbe765e5a7406971f233a5001846cd364efc394f449e5a77f3dab8455ef",
    "size_bytes": 1492,
    "mtime_ns": 1789642660024144000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/extract.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-8731f49c57195682086c20fd0da5144b1f4adab7c3cf399a739412b08d94d095",
    "size_bytes": 536,
    "mtime_ns": 1789663726682346500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/extract.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-d8ec2a342c2466fb4df8a0ac551917325543de607963692e92bc7de8d9bca988",
    "size_bytes": 1487,
    "mtime_ns": 1789665830905890000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/record.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-5334e95a024a1f16910ad2f0f0f5076672c634434cad01d3d9ad9f35b2d91876",
    "size_bytes": 500,
    "mtime_ns": 1789640884858913300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/record.py",
    "kind": "code",
    "file_hash": "sha256-d689dba6cd46e885744a1769bc8889e7f5e214587fcaf954e29a0a2ee9dd86cb",
    "size_bytes": 423,
    "mtime_ns": 1789637027543518000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/validate.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-04b0f0663ffce28aadd370588531a246ecea5f319dc26a5f03a5319c991737df",
    "size_bytes": 787,
    "mtime_ns": 1789640884860448300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/record/validate.py",
    "kind": "code",
    "file_hash": "sha256-67c4d4789c7dc33aff9a58b919894586830e62be0fb65a8046fe8cf24dc82ce1",
    "size_bytes": 3587,
    "mtime_ns": 1789665966848363000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/route/resolve.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-b9d9421b7b8fd158ad6b28836367ff7fec7f6b9b6e84097fd4fe2fd7b57ec62e",
    "size_bytes": 1510,
    "mtime_ns": 1789632209387518000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/route/resolve.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-f302979b3b36c34e17375e5bf48459638d5e8ef3cc6350b20747a9d0de820f46",
    "size_bytes": 622,
    "mtime_ns": 1789636875808142800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/route/resolve.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-62ed2400b2374968409658ffd0d455e243f8a4f746fae5800eae4ec16e9d4292",
    "size_bytes": 2629,
    "mtime_ns": 1789664069154446600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/route/route.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-8d8cc9abd4c2c5a766d6fb70351be723c93f092a05611228bffa19a98b5754bf",
    "size_bytes": 958,
    "mtime_ns": 1789627478451963100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/search_kb/search_kb.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-7baaee145191cab3bb53cf16e51982594c3bdabcfdf8abd8c43c86474c4d2aba",
    "size_bytes": 399,
    "mtime_ns": 1789627439243753500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/tally/tally.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-27065faeab27ac482f04bcdf21e3f24dce4367b614a65870b837cf36e00505b9",
    "size_bytes": 833,
    "mtime_ns": 1789676892464713000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/tally/tally.py",
    "kind": "code",
    "file_hash": "sha256-945b02f8c6aa9d3380675c9fd726def6caeaf89e7b773811adbf43f07c8077c7",
    "size_bytes": 1067,
    "mtime_ns": 1789676873602815000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/to_record/to_record.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-edd18b6f2e4d0ac0c694cc87ce9c2db40fae757283ef3120aaac1f643f083548",
    "size_bytes": 215,
    "mtime_ns": 1789627439242333700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/triage/triage.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-2306d2fb479c0b505920b8db491b91167fdc27acab2ec1396bc75e23621a8423",
    "size_bytes": 3167,
    "mtime_ns": 1789632209473817900,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/triage/triage.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-d7996e9ddd1021bc9699d034f2edc31039f0658aaec21321a4682035ba03e66e",
    "size_bytes": 773,
    "mtime_ns": 1789636875807885000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/triage/triage.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-98f86b6b94d66ac1601a03ffa670fe98ec929c9d7ccbb41b8f1b2f3cef2047ba",
    "size_bytes": 3118,
    "mtime_ns": 1789643815176692200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/voice/voice.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-87dd43f80f97c86eeacd5c0299b5130ed0d2a15ddda773f645aa625e8e2d8e97",
    "size_bytes": 275,
    "mtime_ns": 1789627478493966300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/vote/ballot.inference.yaml",
    "kind": "Inference",
    "file_hash": "sha256-c32b4aabe34510fb0895e459ae8c29cc7a301ce92f71ccbb90d2f2a37b2960dc",
    "size_bytes": 2654,
    "mtime_ns": 1789632208898231300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/vote/ballot.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-1bb2cf29e4d12f3d60f4e993a7b0f38450ec5aaac26512784f9c7a0d3277d5b0",
    "size_bytes": 373,
    "mtime_ns": 1789643815153731800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/vote/ballot.prompt.md",
    "kind": "prompt",
    "file_hash": "sha256-32c92bd41f4d2c85a68ddf08785bcd5132d3bd3891eb28b8877de8155a77bc95",
    "size_bytes": 1523,
    "mtime_ns": 1789664689430192400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "flows/support_case/nodes/vote/vote.node.yaml",
    "kind": "Node",
    "file_hash": "sha256-71d08645a7701a30876818ead07a0f6133fd3d9d261af7fab4be8ffe1c6d9444",
    "size_bytes": 464,
    "mtime_ns": 1789632274733418200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "fragments/brand_voice.md",
    "kind": "prompt",
    "file_hash": "sha256-0636efbf9abaff831d9c51130cf30e248ee07b682f212b9bcc1914250a6ddaac",
    "size_bytes": 569,
    "mtime_ns": 1789577146882162400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "fragments/citation_rules.md",
    "kind": "prompt",
    "file_hash": "sha256-73dd25b57e4aed4686a26a9c69d5aded322ea274a45256ba2d4c56c79b699a24",
    "size_bytes": 516,
    "mtime_ns": 1789577146887159800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "fragments/judge_protocol.md",
    "kind": "prompt",
    "file_hash": "sha256-bc82dc11cbadd66c19b308144c0f0b14fe1883721352d741681df8e589294c8a",
    "size_bytes": 513,
    "mtime_ns": 1789577146889201700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "fragments/safety_escalation.md",
    "kind": "prompt",
    "file_hash": "sha256-fb97cbcd5d740b702087002b4894321720224f4cae1e24c7c54d4970e5812835",
    "size_bytes": 515,
    "mtime_ns": 1789577146891054800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "fragments/untrusted_input.md",
    "kind": "prompt",
    "file_hash": "sha256-d03c0fe122b257ada38b10958b3964be65e4325947acbceccd0716a192316077",
    "size_bytes": 444,
    "mtime_ns": 1789577146884662800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "mcp/helpdesk.yaml",
    "kind": "McpServer",
    "file_hash": "sha256-eb4773100e0cdb2ec18ed099d60b760ea230ef584a9121140f4e2cf478a4f7d3",
    "size_bytes": 321,
    "mtime_ns": 1789627559129055700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "samples/answers.json",
    "kind": "other",
    "file_hash": "sha256-8a5823d8ba557ca0a683423030f04d5f41c844945cd3fd6e786c057ea345f954",
    "size_bytes": 764,
    "mtime_ns": 1789627511725728800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "samples/case_request.json",
    "kind": "other",
    "file_hash": "sha256-e2d61a0070a6959e63e58668082b051c7403459e1104202dc858e104ee753a7b",
    "size_bytes": 1596,
    "mtime_ns": 1789664629955910400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "samples/flow_strip_controller.jpg",
    "kind": "other",
    "file_hash": "sha256-0606035923b6e819a36fc2581f0d9bdb78ccfabe8bb6f44a98ac3b2cbd65e3b6",
    "size_bytes": 1865,
    "mtime_ns": 1789656487667982000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "samples/invoice_LUM-20260903.pdf",
    "kind": "other",
    "file_hash": "sha256-73c299df4819d9854d92954932dc86a16fe13c603013316637ad0385d308e712",
    "size_bytes": 633,
    "mtime_ns": 1789664353837247700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/find_tickets.yaml",
    "kind": "Tool",
    "file_hash": "sha256-9d10ec78e54305f294cfbcf3fde4c05c6425416afdb90c4732073a1f27a56914",
    "size_bytes": 205,
    "mtime_ns": 1789640884893611300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/functions.py",
    "kind": "code",
    "file_hash": "sha256-49b49ef2c5ed9edc857f43b1448e976b73c76dac805f79eec3eda66a7c313b87",
    "size_bytes": 5771,
    "mtime_ns": 1789660106559637200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/issue_store_credit.yaml",
    "kind": "Tool",
    "file_hash": "sha256-8c89f2331981db641117ee399a06ce6660c057b54dd3f02ecd131ff109ce53f8",
    "size_bytes": 892,
    "mtime_ns": 1789640884893819000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/lookup_order.yaml",
    "kind": "Tool",
    "file_hash": "sha256-5110e7f6fef2e2bda11594aea1b1a820c41b22f3b82550e643215638f36cee15",
    "size_bytes": 854,
    "mtime_ns": 1789646837238730000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/render_clip.yaml",
    "kind": "Tool",
    "file_hash": "sha256-517696068985a9e9cf7db0e98dc01065eeeb1579a28282f41d3c66b9ca9e79e1",
    "size_bytes": 935,
    "mtime_ns": 1789642516562118400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/search_kb.yaml",
    "kind": "Tool",
    "file_hash": "sha256-3b2fb8323ec7f3df3cbce72629b0f801dc322ceff916922f7b017d7b40eabb43",
    "size_bytes": 1019,
    "mtime_ns": 1789640884894476000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "tools/synthesize_voice.yaml",
    "kind": "Tool",
    "file_hash": "sha256-1edc48b922ed4061224836152b594aaa73580d803590eb33ed4e76e2b038a698",
    "size_bytes": 603,
    "mtime_ns": 1789640884894677000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types.py",
    "kind": "code",
    "file_hash": "sha256-664641e85dc8a9364a5d257f38583d992526c8728785ee04d6a9f15cda6e539f",
    "size_bytes": 17169,
    "mtime_ns": 1789660119890419200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/agreement.yaml",
    "kind": "Type",
    "file_hash": "sha256-84bf562fc748c8ee36c8d4c03a4d3cc4a21360aff14332c8cda9ab4357b5f97e",
    "size_bytes": 263,
    "mtime_ns": 1789627559125239600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/approval_decision.yaml",
    "kind": "Type",
    "file_hash": "sha256-e4ea53c12199ebab7fd43a21598194716a89281ac2280a13ee1b6d62c7537871",
    "size_bytes": 397,
    "mtime_ns": 1789627559126744000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/cascade_tier.yaml",
    "kind": "Type",
    "file_hash": "sha256-45164284bfc0db016df6d3fd27ad6549f4fd6ba85196240984c3a68f93c3826f",
    "size_bytes": 352,
    "mtime_ns": 1789627559125304800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/case_intent.yaml",
    "kind": "Type",
    "file_hash": "sha256-75d71fce4271d50c476ed5336b3d66e43384ad11040007db19925c0d509b1c33",
    "size_bytes": 533,
    "mtime_ns": 1789627559125129000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/case_status.yaml",
    "kind": "Type",
    "file_hash": "sha256-130f9cc156cc41b1a21a9320e8e43eab7851e7219113d84f088dc7edb0bc9b2c",
    "size_bytes": 295,
    "mtime_ns": 1789627559126950000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/channel.yaml",
    "kind": "Type",
    "file_hash": "sha256-49778babf630b4375841e245a9f400c3ea5d0e33b826e9523895283241b1c897",
    "size_bytes": 389,
    "mtime_ns": 1789627559124827000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/currency_code.yaml",
    "kind": "Type",
    "file_hash": "sha256-75bf223ea516ad6713eced2e4c3fbdeaa37a2b58f2cdb47bd7f5195e99b87810",
    "size_bytes": 268,
    "mtime_ns": 1789577128146367200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/customer_tier.yaml",
    "kind": "Type",
    "file_hash": "sha256-3d87a80305fb7483a91245107a5a8d9f309916ac56c7898467059ecd3979946a",
    "size_bytes": 483,
    "mtime_ns": 1789577128154630100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/defect_symptom.yaml",
    "kind": "Type",
    "file_hash": "sha256-8c6eca3d6646c6cc9d0eb07a99ddce9b76ff97d47a4142e969dff59af19db5fc",
    "size_bytes": 625,
    "mtime_ns": 1789627559125382100,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/delivery_damage.yaml",
    "kind": "Type",
    "file_hash": "sha256-66f96d06906ac6fc42116a26c9cbdc1f236337faeeee3bf4b2482e6b4778e8b1",
    "size_bytes": 395,
    "mtime_ns": 1789627559125449500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/issue_severity.yaml",
    "kind": "Type",
    "file_hash": "sha256-b4463ade93d241547cb3aa0b10d06400db2e7149b90d13262acee86fa3d207c4",
    "size_bytes": 420,
    "mtime_ns": 1789577128158830600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/lamp_kind.yaml",
    "kind": "Type",
    "file_hash": "sha256-1a85685e15b82ff75d8949f96cbeb20d8b7c597e4436cda80d2f2a9adfbe145b",
    "size_bytes": 749,
    "mtime_ns": 1789632202433845200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/marketplace.yaml",
    "kind": "Type",
    "file_hash": "sha256-7a11c2c5a135e0bb213276a31ff201257f99481f0b9b19882a4950bcd8d83b70",
    "size_bytes": 224,
    "mtime_ns": 1789627559124545000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/product_category.yaml",
    "kind": "Type",
    "file_hash": "sha256-87ca28005157c2f1b064c5f414b169ae306c0f46d08fc85a4c142212748f4161",
    "size_bytes": 562,
    "mtime_ns": 1789577128163479300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/reply_criterion.yaml",
    "kind": "Type",
    "file_hash": "sha256-f51d0211d7d701886e93427c6758a3b6cdd393a9cb0d315be230d834fbdfd768",
    "size_bytes": 320,
    "mtime_ns": 1789627559126470700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/resolution_action.yaml",
    "kind": "Type",
    "file_hash": "sha256-5737c8bb1f7da0d99a329f01a11264f841f4133252629075343c0baa71b72869",
    "size_bytes": 438,
    "mtime_ns": 1789627559125855500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/enums/vote_perspective.yaml",
    "kind": "Type",
    "file_hash": "sha256-6cdec70ebebcd0f0e954cca620cbb7f8221a7a34d93b28cc0867e2f432fa9c8c",
    "size_bytes": 556,
    "mtime_ns": 1789627559125074000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/customer_id.yaml",
    "kind": "Type",
    "file_hash": "sha256-85bfea8837792261bbe846b337e26d3ebabe4ca1db0d69440843123f4be81d71",
    "size_bytes": 147,
    "mtime_ns": 1789577128153103600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/kb_chunk_id.yaml",
    "kind": "Type",
    "file_hash": "sha256-4037596ea8dda64e71ee16422e4d520727a17e008283534ad29f166b963b58f4",
    "size_bytes": 195,
    "mtime_ns": 1789627559125593000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/order_id.yaml",
    "kind": "Type",
    "file_hash": "sha256-3b0a80fc632346c165d4453f6dc7c944a714645d6f6b2763e33d3b5abd9f4d0d",
    "size_bytes": 155,
    "mtime_ns": 1789577128149885700,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/policy_id.yaml",
    "kind": "Type",
    "file_hash": "sha256-82120f81f5c8cebb701578d854355947fa2437a7a8d6b26ac6371e0902030913",
    "size_bytes": 260,
    "mtime_ns": 1789627559125715000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/signal_key.yaml",
    "kind": "Type",
    "file_hash": "sha256-d84edd038262927ea0eb8982fa751de0b13485d307b1b961aaf00003d35185e9",
    "size_bytes": 242,
    "mtime_ns": 1789627559124890000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/ids/sku_id.yaml",
    "kind": "Type",
    "file_hash": "sha256-410bc56b84b80894dea8715eac5383d0d8c354a1ee58e0aff4f47b3b404e706d",
    "size_bytes": 125,
    "mtime_ns": 1789577128151553500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/case_outcome.yaml",
    "kind": "Type",
    "file_hash": "sha256-600fa5b10d3556363dd8a42ae306da88ce23c4e578eb247f24fcd9f84aa52ab4",
    "size_bytes": 1131,
    "mtime_ns": 1789627559127082500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/case_request.yaml",
    "kind": "Type",
    "file_hash": "sha256-b6758d2f2c90b93557cb02a6e4e5477d246b2462dee6b869150332fe607db71b",
    "size_bytes": 1652,
    "mtime_ns": 1789627559124757500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/citation.yaml",
    "kind": "Type",
    "file_hash": "sha256-c503014cca17d6d910aa15c4415d13adb72731f3c578c48d6e6b1e101ddc82a0",
    "size_bytes": 387,
    "mtime_ns": 1789627559126053400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/criterion_score.yaml",
    "kind": "Type",
    "file_hash": "sha256-e2cce7f77302b364025737a5210d8c05090d072f8244e86d710bf4fd586d2337",
    "size_bytes": 319,
    "mtime_ns": 1789627559126551600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/critique.yaml",
    "kind": "Type",
    "file_hash": "sha256-aacd26b190afe4d645b64250450008c1d148d4638d4c4388099321017a1caf23",
    "size_bytes": 530,
    "mtime_ns": 1789627559126385000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/customer.yaml",
    "kind": "Type",
    "file_hash": "sha256-d7a1909920e3009ff065b6701a93f963ee5b99d4e3fd21ebfba31630d8cf364d",
    "size_bytes": 783,
    "mtime_ns": 1789577128156346000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/intent_ballot.yaml",
    "kind": "Type",
    "file_hash": "sha256-ce59ad723af8873f2d0de941bdcca8b1e0dc476f01fe2692548f6a9208a97db4",
    "size_bytes": 482,
    "mtime_ns": 1789627559125186800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/issue.yaml",
    "kind": "Type",
    "file_hash": "sha256-c4c17a1dcdd363e08bfdecbf6e1be2187aebcaadc89d3a7d868470cc9c22bf39",
    "size_bytes": 1161,
    "mtime_ns": 1789642661377390300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/judge_verdict.yaml",
    "kind": "Type",
    "file_hash": "sha256-1ff16791fa0fdee2d7d2bf39a187f457c085507609a06247d2d68dedd6678b43",
    "size_bytes": 551,
    "mtime_ns": 1789627559126619400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/kb_chunk.yaml",
    "kind": "Type",
    "file_hash": "sha256-e2620ae2947a9aa1d8dc66b76005c258c6da9a9ca5251276af45433797d4943f",
    "size_bytes": 426,
    "mtime_ns": 1789627559125654500,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/media_approval.yaml",
    "kind": "Type",
    "file_hash": "sha256-c0f88c32f80864df713e8d8a5b9922931889c620d28545a1d4aab4bf2914b613",
    "size_bytes": 478,
    "mtime_ns": 1789627559126893300,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/money.yaml",
    "kind": "Type",
    "file_hash": "sha256-bf20c59cbf79582780b646fedfe7ac610277cba51b4df914d8a0dcbe6768b084",
    "size_bytes": 427,
    "mtime_ns": 1789577128148186000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/observation.yaml",
    "kind": "Type",
    "file_hash": "sha256-1f5f3e354d9c1671bb5c7b3dce662dac735857de74ab33b8c673a62b5bf0a986",
    "size_bytes": 441,
    "mtime_ns": 1789627559125017600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/panel_outcome.yaml",
    "kind": "Type",
    "file_hash": "sha256-246fe73679fbda64132d73989e72dd01663aacb10c24d7e3b5b5034b48620f31",
    "size_bytes": 447,
    "mtime_ns": 1789640871027982000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/panel_request.yaml",
    "kind": "Type",
    "file_hash": "sha256-216739b8a562798b66910bfd9a5bd994113be07ff3c5b6d4d4d70f9c09b99145",
    "size_bytes": 643,
    "mtime_ns": 1789640871026255600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/panel_verdict.yaml",
    "kind": "Type",
    "file_hash": "sha256-9a9afe95b1c7c841942d39d63aaa7a20065af22461ffefe7154450538f8a3496",
    "size_bytes": 572,
    "mtime_ns": 1789642693751175200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/policy.yaml",
    "kind": "Type",
    "file_hash": "sha256-cd77270c35f7e9e7b083dc426c9352655d81b8546dff155bab3e580eebf8a884",
    "size_bytes": 470,
    "mtime_ns": 1789627559125785600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/product_ref.yaml",
    "kind": "Type",
    "file_hash": "sha256-370c68ad95663ffa18cb3e676c593e7b31c25cee0aad597840b2ad2b7dd45d93",
    "size_bytes": 553,
    "mtime_ns": 1789632202436318000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/reply_approval.yaml",
    "kind": "Type",
    "file_hash": "sha256-ca3c5ecd579bf9220f91e6c84a727cb9283a6be79f5ea6e4246b1b262e41d842",
    "size_bytes": 543,
    "mtime_ns": 1789627559126825200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/reply_draft.yaml",
    "kind": "Type",
    "file_hash": "sha256-6186288680c77d960f617294dd5c9066dd228901d7b4c33f23a8ed89f4a1aa27",
    "size_bytes": 394,
    "mtime_ns": 1789627559126274600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/reply_media.yaml",
    "kind": "Type",
    "file_hash": "sha256-13b2bb11c7192aab537479d017c882224a3ecce8460fc672a1687ed5d1568f72",
    "size_bytes": 503,
    "mtime_ns": 1789627559127011600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/resolution.yaml",
    "kind": "Type",
    "file_hash": "sha256-0ace2ce77bf588cfb05d62818538741f71ce0d2ffaa5b967404e861dd3b8dda2",
    "size_bytes": 692,
    "mtime_ns": 1789627559125922600,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/records/signal_def.yaml",
    "kind": "Type",
    "file_hash": "sha256-44cd48eb25c7661f84448fd1681023cc08ddcb35ceb5ce776d352bb523b4b543",
    "size_bytes": 395,
    "mtime_ns": 1789627559124954400,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/unions/case_origin.yaml",
    "kind": "Type",
    "file_hash": "sha256-95823b1d0461766e936d299baece46e8adf953476cbf4bb9ee92338fade1f931",
    "size_bytes": 809,
    "mtime_ns": 1789627559124665000,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/unions/case_record.yaml",
    "kind": "Type",
    "file_hash": "sha256-a559f8b409708543f494cf9eb97186cbb8bf518318c8156fdc9a700ee441d18d",
    "size_bytes": 1613,
    "mtime_ns": 1789627559125535200,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  },
  {
    "path": "types/values/score.yaml",
    "kind": "Type",
    "file_hash": "sha256-9b90a06b7f662085eb8e0e26005f8ecd8d01b6dbaa04d4a19c9b42b3ee5cc5d2",
    "size_bytes": 172,
    "mtime_ns": 1789577128162059800,
    "parse_status": "ok",
    "sync_state": "ok",
    "problems_count": 0,
    "last_good_content_hash": null
  }
]
