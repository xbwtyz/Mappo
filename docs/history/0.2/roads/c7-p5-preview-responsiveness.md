# C7 P5 junction preview responsiveness

[Issue #44](https://github.com/xbwtyz/Mappo/issues/44) tracks the preview frame gaps
that remained after P4 moved independent Apply validation to the worker.
P4 CI recorded worst Large Organic desktop preview gaps of 166.7 ms in
Chromium and 200.2 ms in Firefox.

- Keep preview transport to the impact report, overlay geometry, conflict and
  ledger data, and exact candidate JSON. The editor does not deserialize the
  preview candidate into a second city. Topology-only previews keep their
  display geometry and cannot be applied.
- Keep the independent Apply rebuild, exact candidate and ledger comparisons,
  schema-9 save/load check, stale-draft guards, and atomic commit.
- Skip building the city-wide dependency index when there are no impact
  highlights, including while moving a junction and waiting for preview.
- Run the C7 Small and Large Organic benchmark in Chromium and Firefox at desktop
  and phone sizes. Measure worker dispatch and reply delivery separately from
  end-to-end preview latency and frame gaps. Verify offline Apply, cancellation,
  authored-building decisions, and road edit regressions.
