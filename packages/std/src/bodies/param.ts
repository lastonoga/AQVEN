import type { Component } from "@wf/dsl";

export const componentParam = <I, O>(name: string): Component<I, O> => ({ name: "$" + name });
