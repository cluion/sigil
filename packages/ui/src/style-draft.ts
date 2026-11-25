import { createId } from '@cluion/sigil-core'

/** Keep incomplete CSS edits in the field until the author commits a valid value. */
export function bindStyleDraft(
  input: HTMLInputElement,
  signal: AbortSignal,
  options: {
    live: boolean
    errorClass: string
    editable(): boolean
    validate(value: string): string
    write(value: string): void
  },
) {
  const error = document.createElement('small')
  error.id = 'sigil-style-error-' + createId()
  error.className = options.errorClass
  error.setAttribute('role', 'status')
  error.hidden = true
  let authored = ''
  let draft = false
  let composing = false
  let applying = false
  function feedback(message = '') {
    error.hidden = !message
    if (error.textContent !== message) error.textContent = message
    if (message) input.setAttribute('aria-invalid', 'true')
    else input.removeAttribute('aria-invalid')
  }
  function restore() {
    draft = false
    if (input.value !== authored) input.value = authored
    feedback()
  }
  function sync(value: string, locked: boolean) {
    const changed = value !== authored
    authored = value
    if (!applying && (!draft || changed || locked)) restore()
  }
  function apply(report: boolean): boolean {
    if (!draft) return true
    if (composing || signal.aborted || input.disabled || !options.editable()) return false
    const value = input.value.trim()
    const message = value && options.validate(value)
    if (message) {
      feedback(report ? message : '')
      return false
    }
    applying = true
    try {
      options.write(value)
    } finally {
      applying = false
    }
    if (report) restore()
    else feedback()
    return true
  }
  input.addEventListener(
    'input',
    () => {
      draft = true
      if (options.live && !composing) apply(false)
    },
    { signal },
  )
  input.addEventListener('blur', () => apply(true), { signal })
  input.addEventListener(
    'compositionstart',
    () => {
      composing = true
    },
    { signal },
  )
  input.addEventListener(
    'compositionend',
    () => {
      composing = false
      if (options.live && draft) apply(false)
    },
    { signal },
  )
  input.addEventListener(
    'keydown',
    (event) => {
      if (composing || event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape' && draft) {
        restore()
        event.preventDefault()
        event.stopPropagation()
      } else if (event.key === 'Enter') {
        apply(true)
        event.preventDefault()
        event.stopPropagation()
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 's' &&
        !apply(true)
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    { signal },
  )
  return {
    sync,
    restore,
    appendError(container: HTMLElement) {
      const existing = input.getAttribute('aria-describedby')
      input.setAttribute('aria-describedby', existing ? existing + ' ' + error.id : error.id)
      container.append(error)
    },
  }
}
