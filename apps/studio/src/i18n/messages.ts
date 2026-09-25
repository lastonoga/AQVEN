import type { Locale } from "@/domain"
import authoring from "./messages/en/authoring.json"
import callSheet from "./messages/en/callSheet.json"
import cases from "./messages/en/cases.json"
import chat from "./messages/en/chat.json"
import common from "./messages/en/common.json"
import domain from "./messages/en/domain.json"
import flow from "./messages/en/flow.json"
import health from "./messages/en/health.json"
import project from "./messages/en/project.json"
import research from "./messages/en/research.json"
import review from "./messages/en/review.json"
import runs from "./messages/en/runs.json"
import setup from "./messages/en/setup.json"
import shell from "./messages/en/shell.json"
import trace from "./messages/en/trace.json"

const en = { common, domain, shell, health, chat, flow, cases, runs, trace, callSheet, review, research, authoring, setup, project }

export type Messages = typeof en

export const messages: Readonly<Record<Locale, Messages>> = { en }
