# Can mistral tell which lamp the customer has?

**Hypothesis.** Mistral, a cheaper agent, works out from the case whether the customer has a Wi-Fi bulb, a Zigbee
bulb, a rechargeable lamp or a mains lamp, and gives the setup steps that fit it, as reliably as gpt.

**Subject.** The polish loop of `support_case` (`from: polish`, `to: polish`), with the recorded outputs of the earlier
steps from the dataset.

**Variants.** The factor is the agent on `revise`: `gpt` as written, `mistral` in its place.

**Check.** `steps_match_lamp`: the polished reply carries the steps for the lamp kind named by the case's `lamp_kind`
tag: the Lumen app and Wi-Fi for `smart_wifi`, the hub for `smart_zigbee`, charging for `rechargeable`, the switch or
socket for `mains`.
