---
title: Reuse a Subflow
description: Extract repeated typed work into a smaller flow and invoke it through a call node.
---

Create a subflow with its own input and output contracts. Use a call node to bind the parent values into the subflow. Keep the subflow focused and prevent recursion; a called flow should make an independent contract easier to test and reuse.

Read [Calls and Narrowing](/engineering/calls-and-narrowing/).
