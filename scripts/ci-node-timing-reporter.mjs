// Second native Node reporter: retain TAP on stdout, record structured summaries.
export default async function* timingReporter(source) {
  for await (const event of source) {
    if(event.type!=='test:summary') continue;
    const {file,duration_ms,counts,success}=event.data;
    yield JSON.stringify({file:file??null,duration_ms,counts,success})+'\n';
  }
}
