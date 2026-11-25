import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorHooks, ProjectStore, SigilDoc } from '@cluion/sigil-core'
import { createEditor } from '../src/index.js'

function documentWith(content = 'initial'): SigilDoc {
  return {
    version: 1,
    root: {
      id: 'root',
      type: 'section',
      children: [{ id: 'text', type: 'text', content }],
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
})

function setup(save: ProjectStore['save'] = vi.fn(), hooks?: EditorHooks) {
  const mount = document.createElement('div')
  document.body.append(mount)
  const subject = createEditor({
    mount,
    doc: documentWith(),
    store: { load: () => null, save },
    hooks,
  })
  let disposed = false
  function destroy() {
    if (disposed) return
    disposed = true
    subject.destroy()
    mount.remove()
  }
  cleanups.push(destroy)
  return { subject, mount, destroy }
}

describe('Editor persistence contract', () => {
  it('keeps the saved step available while typing continues and updates an open history dialog after acknowledgement', async () => {
    const write = deferred<void>()
    const save = vi
      .fn()
      .mockReturnValueOnce(write.promise)
      .mockRejectedValueOnce(new Error('offline'))
    const { subject, mount } = setup(save)
    subject.setLocale('en')
    subject.engine.update('text', { content: 'Open registration' })
    const submitted = subject.engine.getHistory().currentId
    const pending = subject.save()
    subject.engine.update('text', { content: 'Registration closed' })
    const latest = subject.engine.getHistory().currentId
    expect(latest).not.toBe(submitted)

    const trigger = mount.querySelector<HTMLButtonElement>('[data-command-id="edit-history"]')!
    expect(trigger.textContent).toBe('Edit history')
    trigger.click()
    const dialog = mount.querySelector<HTMLDialogElement>('.sigil-history-dialog')!
    expect(dialog.querySelector('[data-history-saved]')).toBeNull()
    write.resolve()
    await pending
    const saved = dialog.querySelector<HTMLElement>('[data-history-saved="true"]')!
    expect(saved.dataset.historyId).toBe(String(submitted))
    await expect(subject.save()).rejects.toThrow('offline')
    expect(dialog.querySelector('[data-history-saved="true"]')).toBe(saved)
    subject.setLocale('zh')
    expect(trigger.textContent).toBe('編輯歷程')
    dialog.querySelector<HTMLElement>('[data-history-saved="true"]')!.click()
    expect(subject.toJSON()).toEqual(documentWith('Registration closed'))
    dialog.querySelector<HTMLButtonElement>('.sigil-history-restore')!.click()
    expect(subject.toJSON()).toEqual(documentWith('Open registration'))
    expect(subject.isDirty()).toBe(false)
    expect(document.activeElement).toBe(trigger)
    expect(await subject.runCommand('edit-history')).toBe(true)
    subject.destroy()
    expect(mount.querySelector('.sigil-history-dialog')).toBeNull()
  })

  it('saves from its own property field and leaves native editing keys and host fields alone', async () => {
    const storeSave = vi.fn()
    const { subject, mount } = setup(storeSave)
    subject.engine.select('text')
    const input = [...mount.querySelectorAll('label')]
      .find((el) => el.textContent?.startsWith('內容'))!
      .querySelector('input')!
    input.value = '右側面板'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const key = (name: string) =>
      new KeyboardEvent('keydown', { key: name, metaKey: true, bubbles: true, cancelable: true })
    expect(input.dispatchEvent(key('z'))).toBe(true)
    input.dispatchEvent(new Event('compositionstart', { bubbles: true }))
    expect(input.dispatchEvent(key('s'))).toBe(true)
    input.dispatchEvent(new Event('compositionend', { bubbles: true }))
    input.readOnly = true
    expect(input.dispatchEvent(key('s'))).toBe(true)
    input.readOnly = false
    const hostInput = document.createElement('input')
    mount.append(hostInput)
    expect(hostInput.dispatchEvent(key('s'))).toBe(true)
    expect(storeSave).not.toHaveBeenCalled()
    expect(input.dispatchEvent(key('s'))).toBe(false)
    await vi.waitFor(() =>
      expect(storeSave).toHaveBeenCalledExactlyOnceWith(documentWith('右側面板')),
    )
  })

  it('saves the active canvas edit while keeping read-only snapshots and Undo consistent', async () => {
    const storeSave = vi.fn()
    const { subject, mount } = setup(storeSave)
    const frame = mount.querySelector('iframe')!
    const selector = '[data-sigil-id="text"]'
    await vi.waitFor(() => expect(frame.contentDocument?.querySelector(selector)).toBeTruthy())
    const text = frame.contentDocument!.querySelector<HTMLElement>(selector)!
    vi.spyOn(frame.contentDocument!, 'elementFromPoint').mockReturnValue(text)
    mount.querySelector('.sigil-canvas-overlay')!.dispatchEvent(new MouseEvent('dblclick'))
    expect(text.getAttribute('contenteditable')).toBe('true')

    text.textContent = '現場攝影課'
    text.dispatchEvent(new Event('input', { bubbles: true }))
    expect(subject.isDirty()).toBe(true)
    expect(subject.toJSON()).toEqual(documentWith())
    expect(storeSave).not.toHaveBeenCalled()
    await expect(subject.save()).resolves.toEqual(documentWith('現場攝影課'))
    expect(storeSave).toHaveBeenCalledExactlyOnceWith(documentWith('現場攝影課'))
    expect(subject.isDirty()).toBe(false)
    await subject.runCommand('undo')
    expect(subject.toJSON()).toEqual(documentWith())
  })

  it('keeps the canvas draft while translating its edit, finish and cancel controls', async () => {
    const storeSave = vi.fn()
    const { subject, mount } = setup(storeSave)
    const dock = mount.querySelector<HTMLElement>('.sigil-canvas-actions')!
    const frame = mount.querySelector('iframe')!
    await vi.waitFor(() =>
      expect(frame.contentDocument?.querySelector('[data-sigil-id="text"]')).toBeTruthy(),
    )
    subject.engine.select('text')
    const edit = dock.querySelector<HTMLButtonElement>('button[aria-label="編輯文字"]')!
    edit.click()
    const draft = frame.contentDocument!.querySelector<HTMLElement>('[contenteditable="true"]')!
    draft.textContent = '未送出的文字'
    draft.dispatchEvent(new Event('input', { bubbles: true }))

    subject.setLocale('en')
    const group = dock.querySelector<HTMLElement>('[role="group"][aria-label="Editing text"]')!
    expect(group.hidden).toBe(false)
    const [finish, cancel] = group.querySelectorAll('button')
    expect(finish?.textContent).toBe('Done editing')
    expect(cancel?.textContent).toBe('Cancel editing')
    expect(draft.isConnected).toBe(true)
    expect(subject.toJSON()).toEqual(documentWith())
    expect(subject.isDirty()).toBe(true)

    cancel!.click()
    expect(subject.isDirty()).toBe(false)
    expect(subject.toJSON()).toEqual(documentWith())
    expect(dock.querySelector('[aria-label="Edit text"]')).toBeTruthy()
    expect(storeSave).not.toHaveBeenCalled()
  })

  it('toJSON returns a synchronous snapshot without writing or invoking save hooks', async () => {
    const save = vi.fn()
    const beforeSave = vi.fn()
    const afterSave = vi.fn()
    const { subject } = setup(save, { beforeSave, afterSave })
    subject.engine.update('text', { content: 'changed' })

    const snapshot = subject.toJSON()
    expect(snapshot).toEqual(documentWith('changed'))
    subject.engine.update('text', { content: 'later' })
    await Promise.resolve()

    expect(snapshot).toEqual(documentWith('changed'))
    expect(save).not.toHaveBeenCalled()
    expect(beforeSave).not.toHaveBeenCalled()
    expect(afterSave).not.toHaveBeenCalled()
    expect(subject.isDirty()).toBe(true)
  })

  it('mutating a returned snapshot cannot change the document or its saved state', () => {
    const save = vi.fn()
    const { subject } = setup(save)
    const snapshot = subject.toJSON()
    snapshot.root.children![0]!.content = 'external mutation'
    snapshot.root.children!.push({ id: 'external', type: 'text', content: 'external' })

    expect(subject.toJSON()).toEqual(documentWith())
    expect(subject.isDirty()).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('Undo and Redo restore dirty state relative to the acknowledged save checkpoint', async () => {
    const save = vi.fn()
    const { subject } = setup(save)
    subject.engine.update('text', { content: 'saved' })
    await subject.save()
    subject.engine.update('text', { style: { color: 'red' } })
    expect(subject.isDirty()).toBe(true)

    await subject.runCommand('undo')
    expect(subject.toJSON()).toEqual(documentWith('saved'))
    expect(subject.isDirty()).toBe(false)
    await subject.runCommand('redo')
    expect(subject.toJSON().root.children?.[0]?.style).toEqual({ color: 'red' })
    expect(subject.isDirty()).toBe(true)
    expect(save).toHaveBeenCalledOnce()
  })

  it('a throwing onSaveError callback cannot replace the original persistence failure', async () => {
    const error = new Error('storage unavailable')
    const save = vi.fn<ProjectStore['save']>().mockRejectedValueOnce(error)
    const onSaveError = vi.fn(() => {
      throw new Error('notification failed')
    })
    const { subject } = setup(save, { onSaveError })
    subject.engine.update('text', { content: 'changed' })

    await expect(subject.save()).rejects.toBe(error)
    expect(onSaveError).toHaveBeenCalledExactlyOnceWith(error, {
      engine: subject.engine,
      doc: documentWith('changed'),
    })
    expect(subject.isDirty()).toBe(true)
    expect(subject.isSaving()).toBe(false)
  })

  it('save resolves with the persisted document only after the adapter finishes', async () => {
    const gate = deferred<void>()
    const save = vi.fn(() => gate.promise)
    const { subject } = setup(save)
    expect(subject.isDirty()).toBe(false)
    expect(subject.isSaving()).toBe(false)
    subject.engine.update('text', { content: 'changed' })

    let settled = false
    const result = subject.save().then((doc) => {
      settled = true
      return doc
    })
    expect(subject.isSaving()).toBe(true)
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    expect(subject.isDirty()).toBe(true)

    gate.resolve()
    await expect(result).resolves.toEqual(documentWith('changed'))
    expect(subject.isDirty()).toBe(false)
    expect(subject.isSaving()).toBe(false)
  })

  it('serializes writes and captures each requested document before waiting in the queue', async () => {
    const firstGate = deferred<void>()
    const secondGate = deferred<void>()
    const save = vi
      .fn<ProjectStore['save']>()
      .mockImplementationOnce(() => firstGate.promise)
      .mockImplementationOnce(() => secondGate.promise)
    const { subject } = setup(save)
    subject.engine.update('text', { content: 'first' })
    const first = subject.save()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    subject.engine.update('text', { content: 'second' })
    const second = subject.save()
    subject.engine.update('text', { content: 'third' })
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)

    firstGate.resolve()
    await expect(first).resolves.toEqual(documentWith('first'))
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save.mock.calls.map(([doc]) => doc)).toEqual([
      documentWith('first'),
      documentWith('second'),
    ])
    expect(subject.isDirty()).toBe(true)
    expect(subject.isSaving()).toBe(true)

    secondGate.resolve()
    await expect(second).resolves.toEqual(documentWith('second'))
    expect(subject.isDirty()).toBe(true)
    expect(subject.isSaving()).toBe(false)
    await expect(subject.save()).resolves.toEqual(documentWith('third'))
    expect(subject.isDirty()).toBe(false)
    expect(save).toHaveBeenLastCalledWith(documentWith('third'))
  })

  it.each(['throw', 'reject'] as const)(
    'propagates a store %s, preserves dirty state, and permits a retry',
    async (failure) => {
      const error = new Error('storage unavailable')
      const save = vi.fn<ProjectStore['save']>().mockImplementationOnce(() => {
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })
      const { subject } = setup(save)
      subject.engine.update('text', { content: 'changed' })

      await expect(subject.save()).rejects.toBe(error)
      expect(subject.isDirty()).toBe(true)
      expect(subject.isSaving()).toBe(false)
      await expect(subject.save()).resolves.toEqual(documentWith('changed'))
      expect(save).toHaveBeenCalledTimes(2)
      expect(subject.isDirty()).toBe(false)
    },
  )

  it('continues queued saves after an earlier write rejects', async () => {
    const gate = deferred<void>()
    const error = new Error('first write failed')
    const save = vi.fn<ProjectStore['save']>().mockImplementationOnce(() => gate.promise)
    const { subject } = setup(save)
    subject.engine.update('text', { content: 'first' })
    const first = subject.save()
    const rejected = expect(first).rejects.toBe(error)
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    subject.engine.update('text', { content: 'second' })
    const second = subject.save()

    gate.reject(error)
    await rejected
    await expect(second).resolves.toEqual(documentWith('second'))
    expect(save.mock.calls.map(([doc]) => doc)).toEqual([
      documentWith('first'),
      documentWith('second'),
    ])
    expect(subject.isDirty()).toBe(false)
    expect(subject.isSaving()).toBe(false)
  })

  it.each(['throw', 'reject'] as const)(
    'a beforeSave %s blocks persistence and leaves the document dirty',
    async (failure) => {
      const error = new Error('validation failed')
      const beforeSave = vi
        .fn<NonNullable<EditorHooks['beforeSave']>>()
        .mockImplementationOnce(() => {
          if (failure === 'throw') throw error
          return Promise.reject(error)
        })
      const save = vi.fn()
      const afterSave = vi.fn()
      const { subject } = setup(save, { beforeSave, afterSave })
      subject.engine.update('text', { content: 'changed' })

      await expect(subject.save()).rejects.toBe(error)
      expect(save).not.toHaveBeenCalled()
      expect(afterSave).not.toHaveBeenCalled()
      expect(subject.isDirty()).toBe(true)
      expect(subject.isSaving()).toBe(false)
      await subject.save()
      expect(save).toHaveBeenCalledOnce()
      expect(subject.isDirty()).toBe(false)
    },
  )

  it('persists and returns the beforeSave transformation without replacing the editing document', async () => {
    const transformed = documentWith('transformed')
    const beforeSave = vi.fn(async () => transformed)
    const afterSave = vi.fn()
    const save = vi.fn()
    const { subject } = setup(save, { beforeSave, afterSave })
    subject.engine.update('text', { content: 'changed' })

    await expect(subject.save()).resolves.toEqual(transformed)
    expect(beforeSave).toHaveBeenCalledWith(documentWith('changed'), { engine: subject.engine })
    expect(save).toHaveBeenCalledWith(transformed)
    expect(afterSave).toHaveBeenCalledWith(transformed, { engine: subject.engine })
    expect(subject.engine.toJSON()).toEqual(documentWith('changed'))
    expect(subject.isDirty()).toBe(false)
  })

  it.each(['throw', 'reject'] as const)(
    'an afterSave %s does not turn a successful write into a failed save',
    async (failure) => {
      const error = new Error('notification failed')
      const afterSave = vi.fn(() => {
        if (failure === 'throw') throw error
        return Promise.reject(error)
      })
      const save = vi.fn()
      const { subject } = setup(save, { afterSave })
      subject.engine.update('text', { content: 'changed' })

      await expect(subject.save()).resolves.toEqual(documentWith('changed'))
      expect(save).toHaveBeenCalledOnce()
      expect(afterSave).toHaveBeenCalledOnce()
      expect(subject.isDirty()).toBe(false)
      expect(subject.isSaving()).toBe(false)
    },
  )

  it('keeps edits made while afterSave is pending dirty', async () => {
    const gate = deferred<void>()
    const afterSave = vi.fn(() => gate.promise)
    const { subject } = setup(vi.fn(), { afterSave })
    subject.engine.update('text', { content: 'saved' })
    const pending = subject.save()
    await vi.waitFor(() => expect(afterSave).toHaveBeenCalledOnce())
    subject.engine.update('text', { content: 'unsaved' })

    gate.resolve()
    await pending
    expect(subject.isDirty()).toBe(true)
    expect(subject.isSaving()).toBe(false)
  })

  it('runCommand(save) waits for persistence and propagates adapter failures', async () => {
    const gate = deferred<void>()
    const error = new Error('storage unavailable')
    const save = vi.fn<ProjectStore['save']>().mockImplementationOnce(() => gate.promise)
    const { subject } = setup(save)
    expect(subject.isSaving()).toBe(false)
    subject.engine.update('text', { content: 'changed' })
    let settled = false
    const command = subject.runCommand('save').finally(() => {
      settled = true
    })
    const rejected = expect(command).rejects.toBe(error)
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(settled).toBe(false)
    expect(subject.isSaving()).toBe(true)

    gate.reject(error)
    await rejected
    expect(subject.isDirty()).toBe(true)
    await expect(subject.runCommand('save')).resolves.toBe(true)
    expect(subject.isDirty()).toBe(false)
  })

  it('destroy rejects new and queued saves but allows an already submitted write to settle', async () => {
    const gate = deferred<void>()
    const afterSave = vi.fn()
    const save = vi.fn(() => gate.promise)
    const { subject, destroy } = setup(save, { afterSave })
    subject.engine.update('text', { content: 'first' })
    const first = subject.save()
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    subject.engine.update('text', { content: 'second' })
    const queued = subject.save()
    const rejected = expect(queued).rejects.toThrow()

    destroy()
    await expect(subject.save()).rejects.toThrow()
    gate.resolve()
    await expect(first).resolves.toEqual(documentWith('first'))
    await rejected
    expect(save).toHaveBeenCalledOnce()
    expect(afterSave).not.toHaveBeenCalled()
    expect(subject.isSaving()).toBe(false)
  })

  it('destroy while beforeSave is pending prevents its write and afterSave callback', async () => {
    const gate = deferred<void>()
    const beforeSave = vi.fn(() => gate.promise)
    const afterSave = vi.fn()
    const save = vi.fn()
    const { subject, destroy } = setup(save, { beforeSave, afterSave })
    subject.engine.update('text', { content: 'changed' })
    const pending = subject.save()
    const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(beforeSave).toHaveBeenCalledOnce())

    destroy()
    gate.resolve()
    await rejected
    expect(save).not.toHaveBeenCalled()
    expect(afterSave).not.toHaveBeenCalled()
    expect(subject.isSaving()).toBe(false)
  })

  it('keyboard save consumes persistence rejection and permits a later retry', async () => {
    const error = new Error('storage unavailable')
    const save = vi.fn<ProjectStore['save']>().mockRejectedValueOnce(error)
    const onSaveError = vi.fn(async () => {
      throw new Error('host error notification failed')
    })
    const { subject, mount } = setup(save, { onSaveError })
    expect(subject.isSaving()).toBe(false)
    subject.engine.update('text', { content: 'changed' })
    mount.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }))

    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(subject.isSaving()).toBe(false))
    expect(onSaveError).toHaveBeenCalledExactlyOnceWith(error, {
      engine: subject.engine,
      doc: documentWith('changed'),
    })
    expect(subject.isDirty()).toBe(true)
    await subject.save()
    expect(subject.isDirty()).toBe(false)
  })
})
