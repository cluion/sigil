import { createI18n, type I18n } from '@cluion/sigil-core'

export function createEnglishUiI18n(): I18n {
  return createI18n(
    {
      zh: {},
      en: {
        'props.title': 'Properties',
        'props.empty': 'No node selected',
        'props.content': 'Content',
        'props.node_id_open': ' (',
        'props.node_id_close': ')',
        'style.title': 'Styles',
        'inspector.tab_content': 'Content',
        'inspector.tab_style': 'Style',
        'inspector.tab_advanced': 'Advanced',
        'inspector.empty': 'No component selected',
        'inspector.empty_hint':
          'Select a block on the canvas to edit its content, styles, and advanced properties.',
        'inspector.no_content':
          'This node has no editable content fields. Use the Style tab instead.',
        'inspector.image': 'Image',
        'inspector.layout': 'Layout',
        'inspector.typography': 'Typography',
        'inspector.appearance': 'Appearance',
        'inspector.delete_component': 'Delete component',
        'form.add': 'Add',
        'form.delete': 'Delete',
        'form.pick_image': 'Choose image',
        'form.load_unavailable': 'Unavailable',
        'form.loading': 'Loading…',
        'form.load_failed': 'Failed to load',
        'form.label_separator': ': ',
        'style.base': 'Base styles',
        'style.inherit_desktop': 'Inherits Desktop when not overridden',
        'style.inherit_tablet_desktop': 'Inherits Tablet, then Desktop, when not overridden',
        'style.override': 'Override',
        'style.inherit': 'Inherited',
        'style.unset': 'Not set',
        'style.unset_short': 'Not set',
        'style.use_inheritance': 'Use inherited',
        'style.clear': 'Clear',
        'style.clear_desktop': 'Clear Desktop styles',
      },
    },
    'en',
  )
}
