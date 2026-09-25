# Does the panel pick grounded replies

**Purpose:** a threshold on one property of the panel's pick.

A reply that tells the customer something the knowledge base does not say is the most expensive mistake the panel
can let through. The claim is that the winner the panel picks is grounded: every quote it cites is text of one of the
case's chunks.

**Check.** `grounded` is a code check in `checks.py`. It passes when every citation of the winner quotes text that
the case chunks contain.

**Reading the result.** The panel passes when `grounded` stays above 0.9 with a margin of 0.05.
