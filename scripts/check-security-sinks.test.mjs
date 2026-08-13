import { describe, expect, it } from 'vitest'

import { findSecurityFindings, validateSecurityFindings } from './check-security-sinks.mjs'

describe('security sink guard', () => {
  it('detects raw HTML and dynamic DOM operations', () => {
    const findings = findSecurityFindings(
      'packages/example/src/view.ts',
      [
        'target.innerHTML = input',
        'document.createElement(node.tagName)',
        "document.createElement('section')",
        'document.createElement(`${node.tagName}`)',
        'target.setAttribute(name, value)',
        "new DOMParser().parseFromString(input, 'text/html')",
        'trustedTypes.createPolicy(name, rules)',
      ].join('\n'),
    )

    expect(findings.map(({ kind }) => kind)).toEqual([
      'innerHTML access',
      'dynamic createElement call',
      'dynamic createElement call',
      'dynamic setAttribute call',
      'DOMParser parseFromString call',
      'Trusted Types policy creation',
    ])
    expect(validateSecurityFindings(findings, [])).toHaveLength(6)
  })

  it('requires an exact reviewed occurrence count', () => {
    const findings = findSecurityFindings(
      'packages/example/src/view.ts',
      'target.innerHTML = input; target.innerHTML = input',
    )
    const allowances = [
      {
        file: 'packages/example/src/view.ts',
        kind: 'innerHTML access',
        source: 'target.innerHTML = input; target.innerHTML = input',
        count: 1,
        reason: 'Test fixture.',
      },
    ]

    expect(validateSecurityFindings(findings, allowances)).toEqual([
      'reviewed occurrence mismatch: packages/example/src/view.ts (innerHTML access, expected 1, found 2)',
    ])
  })
})
