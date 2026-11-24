// Keyboard map commands must never steal text-entry or menu navigation.
export function isEditableShortcutTarget(target) {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY'].includes(String(target.tagName || '').toUpperCase())) return true;
  return Boolean(target.closest?.('[contenteditable=""],[contenteditable="true"],[role="textbox"]'));
}
export function isMapShortcutEvent(event, activeElement) {
  return !event?.defaultPrevented && !isEditableShortcutTarget(event?.target)
    && !isEditableShortcutTarget(activeElement);
}

// One ordered dispatcher; DOM-local controls retain native and ARIA behavior.
export function dispatchInputCommandA2(event,activeElement,commands){
  if(!event||event.defaultPrevented||event.isComposing)return false;
  for(const command of commands){
    if(command.scope==='map'&&!isMapShortcutEvent(event,activeElement))continue;
    if(command.match(event)&&command.run(event)!==false)return true;
  }
  return false;
}
