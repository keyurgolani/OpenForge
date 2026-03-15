# Phase 10 State Transfer And Merge

Phase 10 defines explicit state boundaries across parent and child execution.

Parent to child:

- select source fields
- reshape input state
- validate against the child input schema

Child to parent:

- direct field mapping
- append-to-collection merge
- artifact reference merge
- evidence reference merge
- reducer-driven aggregation

Failures:

- schema mismatch must fail explicitly
- unsafe merge must fail explicitly
- unresolved branches must remain visible to join and reduce logic
