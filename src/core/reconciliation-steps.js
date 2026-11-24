export function finishLareSteps(iterator) {
  for (;;) {
    const step = iterator.next();
    if (step.done) return step.value;
  }
}

export function* lareStepResult(result) {
  return typeof result?.next === 'function' ? yield* result : result;
}
