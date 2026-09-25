# Do reply drafts answer the real request of a long message?

**Hypothesis.** When a long message opens with a side topic (a late parcel that did arrive, praise, a question about
colours), the reply drafts answer the opening topic and miss what the customer actually asks for.

**Subject.** The local flow `draft_on_message`: gpt writes a reply draft from the customer's message.

**Cases.** `long_customer_messages`: twelve long messages. The `opens_with` tag names the topic a message leads with,
the `intent` tag the request a support lead found in it; in most cases they differ.

**Check.** `answers_the_request`: the draft uses the words of the request named by the case's `intent` tag.
