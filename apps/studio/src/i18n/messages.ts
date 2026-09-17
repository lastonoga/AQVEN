import type { Locale } from "@/domain"
import callSheet from "./messages/en/callSheet.json"
import chat from "./messages/en/chat.json"
import common from "./messages/en/common.json"
import dataflow from "./messages/en/dataflow.json"
import domain from "./messages/en/domain.json"
import nodes from "./messages/en/nodes.json"
import review from "./messages/en/review.json"
import schema from "./messages/en/schema.json"
import setup from "./messages/en/setup.json"
import shell from "./messages/en/shell.json"
import testDetail from "./messages/en/testDetail.json"
import tests from "./messages/en/tests.json"
import trace from "./messages/en/trace.json"

const en = { common, domain, shell, chat, schema, trace, dataflow, callSheet, nodes, tests, testDetail, review, setup }

export type Messages = typeof en

export const messages: Readonly<Record<Locale, Messages>> = { en }
