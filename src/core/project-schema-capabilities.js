// Canonical region/component geometry was introduced by project Schema 10
// and is unchanged in the approved Schema 11 identity-only data contract.
// Deliberately explicit: a future project schema is not implicitly supported.
// This capability is not a full stored-project or geometry validation gate.
export function supportsCanonicalBuildingProjectSchema(version){
  return version===10||version===11;
}
