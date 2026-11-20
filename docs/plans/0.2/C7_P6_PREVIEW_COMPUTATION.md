# C7 P6 preview computation

P5 reduced worker-message delivery overhead. Local browser traces still showed
long frame gaps while the junction worker was calculating. P6 tackles part of
the calculation cost and measures the effect both inside the worker and at the UI.

A Node CPU profile of the Large Organic fixture (`c2-organic`, junctions
`N-0145`, `N-0239`, and `N-0332`, X +8) showed repeated impact analysis,
stored-project validation, graph and face extraction, and deep cloning.

- Reuse the detached draft's graph, face identity, and initial impact analysis
  within the preserve-first attempt and its adapted-building retry.
- Clone draft geometry when an attempt reaches mutation. Clone project metadata
  when wrapping the already detached candidate city.
- Compare the reports, candidate JSON, ledger and display geometry with P5 on
  identical fixtures. Compare worker reconciliation time, total preview time,
  and worst frame gaps with the same Chromium and Firefox benchmarks.
- Verify fresh Apply, schema-9 round-trip, author-created building choices,
  worker cancellation, and Undo/Redo. Each Apply starts its own rebuild.
- Keep [Issue #44](https://github.com/xbwtyz/Mappo/issues/44) open for the
  responsiveness evidence and remaining stalls.
