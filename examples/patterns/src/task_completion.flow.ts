import { branch, code, defineComponent, defineFlow, human, llm, root, tool, $const } from "@wf/dsl";
import type { Fn, Type } from "@wf/dsl";
import { loopTypes, taskCompletion } from "@wf/std/loops";
import type { ChecklistItem, ChecklistItemId } from "@wf/std/loops";

type Account = { id: string; name: string; plan: string };
type OnboardingRequest = { accountId: string; owner: string; checklist: ChecklistItem[] };
type OnboardingTask = { account: Account; owner: string; deadlineDays: number };
type Artifact = { itemId: ChecklistItemId; kind: string; url: string };
type OnboardingState = { summary: string; artifacts: Artifact[] };
type Completion = "done" | "partial";
type OnboardingReport = { text: string; openItems: string[] };

const ty = <T>(name: string): Type<T> => ({ name });

const t = {
  Account: ty<Account>("Account"),
  OnboardingTask: ty<OnboardingTask>("OnboardingTask"),
  OnboardingState: ty<OnboardingState>("OnboardingState"),
  Completion: ty<Completion>("Completion"),
  CompletionFlag: ty<{ status: Completion; closed: number }>("CompletionFlag"),
  OnboardingReport: ty<OnboardingReport>("OnboardingReport"),
  HandoverForm: ty<unknown>("HandoverForm"),
  TaskCompletionOnboarding: ty<{
    state: OnboardingState;
    checklist: ChecklistItem[];
    allDone: boolean;
    iterations: number;
  }>("TaskCompletion<OnboardingState>"),
};

const accountById: Fn<{ accountId: string }, Account> = { name: "account_by_id" };
const buildOnboardingTask: Fn<{ account: Account; owner: string; deadlineDays: number }, OnboardingTask> = {
  name: "build_onboarding_task",
};
const workOnChecklist: Fn<
  { task: OnboardingTask; state: OnboardingState; checklist: ChecklistItem[] },
  OnboardingState
> = { name: "work_on_checklist" };
const checkChecklist: Fn<{ state: OnboardingState; checklist: ChecklistItem[] }, ChecklistItem[]> = {
  name: "check_checklist",
};
const completionFlag: Fn<{ checklist: ChecklistItem[]; allDone: boolean }, { status: Completion; closed: number }> = {
  name: "completion_flag",
};
const renderOnboarding: Fn<
  { state: OnboardingState; checklist: ChecklistItem[]; iterations: number },
  OnboardingReport
> = { name: "render_onboarding" };

const $work = root<{ task: OnboardingTask; state: OnboardingState; checklist: ChecklistItem[] }>("in");

const advance = llm("advance", {
  description: "Шаг работы: закрывает ближайшие незакрытые пункты и складывает артефакты в состояние",
  fn: workOnChecklist,
  modelRole: "writer",
  overrides: { temperature: 0.3, maxOutputTokens: 900 },
  trustIn: "trusted",
  allowedSets: [{ type: loopTypes.ChecklistItemId, from: $work.checklist.$all.id }],
  outputContract: { mode: "strict", maxRepairs: 1, onTruncated: "fail", onRefusal: "fail" },
  in: { task: $work.task, state: $work.state, checklist: $work.checklist },
});

const onboardingWorker = defineComponent({
  name: "onboarding_worker",
  in: { task: "OnboardingTask", state: "OnboardingState", checklist: "ChecklistItem[]" },
  out: { type: "OnboardingState", from: advance.out },
  nodes: [advance],
});

const $check = root<{ state: OnboardingState; checklist: ChecklistItem[] }>("in");

const recheck = code("recheck", {
  description: "Проверка пунктов чеклиста по артефактам состояния, без модели",
  fn: checkChecklist,
  pure: true,
  timeoutMs: 5_000,
  out: loopTypes.ChecklistItemArr,
  in: { state: $check.state, checklist: $check.checklist },
});

const checklistChecker = defineComponent({
  name: "checklist_checker",
  in: { state: "OnboardingState", checklist: "ChecklistItem[]" },
  out: { type: "ChecklistItem[]", from: recheck.out },
  nodes: [recheck],
});

const $input = root<OnboardingRequest>("input");

const load_account = tool("load_account", {
  description: "Карточка аккаунта по идентификатору",
  tool: accountById,
  effect: "read",
  ttlSeconds: 900,
  timeoutMs: 10_000,
  out: t.Account,
  in: { accountId: $input.accountId },
});

const onboarding_task = code("onboarding_task", {
  description: "Сборка задачи: аккаунт, ответственный, срок",
  fn: buildOnboardingTask,
  pure: true,
  timeoutMs: 5_000,
  out: t.OnboardingTask,
  in: { account: load_account.out, owner: $input.owner, deadlineDays: $const(14) },
});

const close_items = taskCompletion<OnboardingTask, OnboardingState>("close_items", {
  description: "Работа до закрытия чеклиста: до 5 проходов или до бюджета, переносится сводка, берём последнее состояние",
  worker: onboardingWorker,
  checker: checklistChecker,
  control: {
    maxIter: 5,
    budget: { usdMicros: 200_000, seconds: 240 },
    carry: { history: "summary" },
    onExhausted: "escalate_human",
  },
  stopWhen: (iter) => iter.allDone,
  stateType: t.OnboardingState,
  out: t.TaskCompletionOnboarding,
  in: {
    task: onboarding_task.out,
    checklist: $input.checklist,
    state: $const<OnboardingState>({ summary: "", artifacts: [] }),
  },
});

const completion = code("completion", {
  description: "Итог цикла: все пункты закрыты или бюджет исчерпан",
  fn: completionFlag,
  pure: true,
  timeoutMs: 5_000,
  out: t.CompletionFlag,
  in: { checklist: close_items.out.checklist, allDone: close_items.out.allDone },
});

const handover = human("handover", {
  description: "Передача незакрытых пунктов ответственному",
  form: t.HandoverForm,
  timeoutSeconds: 86_400,
  onTimeout: "escalate",
  out: t.OnboardingState,
  in: { state: close_items.out.state, checklist: close_items.out.checklist },
});

const final_state = branch("final_state", {
  description: "Ветка по признаку закрытия чеклиста",
  on: completion.out.status,
  onType: t.Completion,
  default: null,
  cases: { done: close_items.out.state, partial: handover },
});

const report = code("report", {
  description: "Отчёт по онбордингу с перечнем открытых пунктов",
  fn: renderOnboarding,
  pure: true,
  timeoutMs: 5_000,
  out: t.OnboardingReport,
  in: { state: final_state.out, checklist: close_items.out.checklist, iterations: close_items.out.iterations },
});

export default defineFlow({
  flow: "task_completion",
  version: 1,
  input: "OnboardingRequest",
  output: { type: "OnboardingReport", from: report.out },
  context: ["date", "locale", "tenant"],
  budget: { usdMicros: 300_000, seconds: 300, tokens: null },
  policies: {
    trust: { defaultIn: "trusted" },
    loops: { checklistFromInput: true, repeatedIssuesStop: true },
    escalation: { role: "onboarding_manager" },
  },
  defaults: {
    retry: { attempts: 2, backoff: "exponential", baseDelayMs: 500, jitter: "full", retryOn: ["timeout", "rate_limit"] },
    timeoutMs: 60_000,
  },
  components: { onboardingWorker, checklistChecker },
  nodes: [load_account, onboarding_task, close_items, completion, handover, final_state, report],
});
