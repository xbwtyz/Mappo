# 0.2A-5 — Impact report usability

Single development pass based on merged A4. A3 remains the authoritative source of issue codes, severities, affected IDs, validation and preservation. Only presentation is changed.

- Group diagnostics by **severity + issue code**, retaining every underlying typed affected ID and the full original diagnostic message.
- Prioritize blocking causes first, review groups second and informational updates last.
- Add plain-language titles and guidance for common road, frontage, setback, building access, protected structure and face-identity conditions. Unknown codes have a conservative non-prescriptive fallback.
- Expand groups to inspect exact affected IDs, diagnostic messages, codes and related IDs.
- Locate individual affected records by kind-qualified ID using accepted geometry, without mutating project, changing selection or pretending unknown geometry is drawable.
- Reports refresh on new analysis; 0.2A still has **no Apply**, auto-repair, schema migration or accepted-state mutation.
- Version: **0.2-dev.a5**, schema **9**.

## Verification
The pull-request CI is the release gate. Manual physical touch / assistive-technology verification remains separate from automated viewport and keyboard testing.