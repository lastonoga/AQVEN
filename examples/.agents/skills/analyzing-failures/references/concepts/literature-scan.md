# Scanning the literature before you test

Before you rank hypotheses, look up what is already known about the riskiest assumptions — where to search, what to write down, how to mark what nobody has confirmed, and why the web is a source for the domain but never for the engine.

## In short

Many risky assumptions have been tested before by someone else: whether a model family can read small print
on a scanned page, how a judge drifts, which public dataset has the labels you need. Spend a short scan
on the riskiest assumptions before you design experiments. Write down each source with its date, the claim
it makes and how strong the evidence is. Mark what nobody confirmed as unverified, and mark domain facts
that need an expert. The web is a source for the domain and for methods. It is never a source for how
AQVEN works: those facts come from the documentation of the version you run.

## When to scan

- **After error analysis, before you rank hypotheses.** You know the failure modes, and you are about to
  decide which claim to test first. A known result can move a hypothesis up the list, or remove it.
- **When an assumption could kill the product.** "The model reads the total on a crumpled receipt
  photographed with a phone" is worth an hour of reading before a day of series.
- **When you need labelled data.** A public dataset with labels from experts beats any labels you derive.
- **When a result surprises you.** Check whether others saw the same effect before you call it a finding.

## Where to look

| Source | Good for | Watch out for |
|---|---|---|
| papers and preprints | measured effects, benchmark numbers, known failure patterns | preprints are not reviewed; a benchmark may not match your inputs |
| model cards and provider documentation | input limits, supported features, image resolution, output modes | marketing claims; a feature listed is not a feature proven on your task |
| public labelled datasets | real inputs with labels from their source | the license; how the labels were made; whether the population matches yours |
| practitioner write-ups | evaluation methods, error analysis, pitfalls | one team's experience; numbers without a method |
| domain references | what a rule, a category or a term means in the field | definitions that differ between sources; facts that need an expert to apply |

## What to write down

For every source, one short entry:

- **Link and date opened.** A page can change after you read it.
- **The claim**, in one sentence, with its number if it has one.
- **The evidence**: measured on data, observed in a few cases, or only stated.
- **How it applies here**: same kind of input, same model family, same population, or only similar.
- **What it changes**: a hypothesis moved up or down, a new negative control, a dataset to use, a method
  for a check.

Keep the entries where the next reader looks: in the `experiment.md` of the experiment they shaped, and in
the "Open questions" or "How we measure" section of the project's
research journal.

## Mark what nobody confirmed

- A claim you found but could not trace to data gets a plain `UNVERIFIED:` in front of it. It may still
  guide a hypothesis. It never becomes a fact in a report.
- A domain assumption that needs an expert, such as which clauses make a contract high-risk, gets
  "needs expert sign-off". Labels built from it carry the same mark until someone signs off.
- A dataset without a license you can read is not used, however good its labels look.

## The web is not a source for the engine

Summaries of web pages lose details and sometimes invent them. That is tolerable for the domain, where
you mark what you could not confirm. It is not tolerable for the engine you run: a binding syntax, a key of
`aqven.yaml` or a node kind learned from a web summary may not exist in your version. Engine facts come
from the documentation of that version and from `aqven check`, whose messages name the fix.

## An example

A scan entry in an experiment's `experiment.md`, before the experiment on whether cheap vision models read
the line items and the total on scanned invoices:

```markdown
## Literature

- <paper title and link>, opened 2026-09-24. Claim: small vision models misread fine print
  when it covers a small part of a large page. Evidence: measured on a synthetic
  benchmark. Applies: same model family, printed forms rather than invoices. Changes:
  the total is tested on a crop of the totals block at native resolution, not only on
  the whole page.
- UNVERIFIED: <forum post and link> says the provider downsizes large images. Changes: the
  trace of one run is read to see the pixel size the model received.
- <tax authority guide and link>: the fields an invoice must carry in one country. Needs
  expert sign-off before the "missing required field" labels built from it count as
  ground truth.
```

## How this shapes what you do

- Scan the riskiest assumptions after error analysis and before you rank hypotheses.
- Write each source with its date, claim, evidence and what it changes.
- Mark unverified claims and expert-dependent assumptions, and carry the mark into labels and reports.
- Learn the engine from its own documentation and `aqven check`, never from web summaries.

## See also

- [Hypotheses by category](hypothesis-categories.md): how a scan result turns into a claim.
- Cases that can answer the question: public datasets and derived labels.
- The research journal: where open questions live between sessions.
