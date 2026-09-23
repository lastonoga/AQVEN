import type { Locale } from "@/domain"
import callSheet from "./messages/en/callSheet.json"
import chat from "./messages/en/chat.json"
import common from "./messages/en/common.json"
import domain from "./messages/en/domain.json"
import datasets from "./messages/en/datasets.json"
import flow from "./messages/en/flow.json"
import nodes from "./messages/en/nodes.json"
import project from "./messages/en/project.json"
import review from "./messages/en/review.json"
import runs from "./messages/en/runs.json"
import setup from "./messages/en/setup.json"
import shell from "./messages/en/shell.json"
import trace from "./messages/en/trace.json"

const en = { common, domain, shell, chat, flow, nodes, datasets, runs, trace, callSheet, review, setup, project }

export type Messages = typeof en

export const messages: Readonly<Record<Locale, Messages>> = { en }
