export { componentParam } from "./param.js";
export { bodyTypes, ty } from "./types.js";
export type { CandidateT, TaskT } from "./types.js";
export { divergeBody } from "./diverge.js";
export { aggregateBody } from "./aggregate.js";
export { judgeBody } from "./judge.js";
export { judgePanelBody } from "./judge-panel.js";
export { verifyFixBody } from "./verify-fix.js";

import { divergeBody } from "./diverge.js";
import { aggregateBody } from "./aggregate.js";
import { judgeBody } from "./judge.js";
import { judgePanelBody } from "./judge-panel.js";
import { verifyFixBody } from "./verify-fix.js";

export const stdBodies = {
  diverge: divergeBody,
  aggregate: aggregateBody,
  judge: judgeBody,
  judgePanel: judgePanelBody,
  verifyFix: verifyFixBody,
};
