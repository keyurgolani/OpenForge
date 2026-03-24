import { StreamLanguage } from '@codemirror/language'

/**
 * Simple stream parser for prompt template syntax.
 * Highlights: {{variables}}, {% control %}, {# comments #}, {{functions()}}
 */

interface TemplateState {
  inVariable: boolean
  inControl: boolean
  inComment: boolean
}

const templateLanguage = StreamLanguage.define<TemplateState>({
  startState() {
    return { inVariable: false, inControl: false, inComment: false }
  },

  token(stream, state) {
    // Comment blocks: {# ... #}
    if (state.inComment) {
      if (stream.match('#}')) {
        state.inComment = false
        return 'comment'
      }
      stream.next()
      return 'comment'
    }
    if (stream.match('{#')) {
      state.inComment = true
      return 'comment'
    }

    // Variable blocks: {{ ... }}
    if (state.inVariable) {
      if (stream.match('}}')) {
        state.inVariable = false
        return 'variableName'
      }
      // Type indicators ::
      if (stream.match('::')) {
        return 'keyword'
      }
      // Function parens
      if (stream.match('(') || stream.match(')')) {
        return 'paren'
      }
      stream.next()
      return 'variableName'
    }
    if (stream.match('{{')) {
      state.inVariable = true
      return 'variableName'
    }

    // Control blocks: {% ... %}
    if (state.inControl) {
      if (stream.match('%}')) {
        state.inControl = false
        return 'keyword'
      }
      // Highlight keywords
      if (stream.match(/\b(if|else|endif|for|in|endfor)\b/)) {
        return 'keyword'
      }
      stream.next()
      return 'keyword'
    }
    if (stream.match('{%')) {
      state.inControl = true
      return 'keyword'
    }

    // Default: skip to next potential template token
    stream.next()
    return null
  },
})

export { templateLanguage }
