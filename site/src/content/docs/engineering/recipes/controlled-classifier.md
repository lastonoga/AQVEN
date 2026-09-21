---
title: Build a Classifier with Controlled Categories
description: Classify an input into a declared enum and route it through exhaustive downstream behavior.
---

Declare an enum for the allowed categories and use it in the inference output record. Include an explicit unknown or needs-review category when the product needs one. Bind the result into a switch whose cases cover every enum value, then test every category and an ambiguous input.

Read [Enum Types](/engineering/enum-types/) and [Switch](/engineering/switch/).
