import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeStructuredEntityRefs, renderAgentMessageContent } from './agent-content.ts'

test('normalizeStructuredEntityRefs converts structured OpenForge entity refs to markdown links', () => {
    const content = [
        'Read [[knowledge:11111111-1111-1111-1111-111111111111:Roadmap]]',
        'Then [[chat:22222222-2222-2222-2222-222222222222:Sprint Sync]]',
        'Inside [[workspace:33333333-3333-3333-3333-333333333333:Ops]].',
    ].join('\n')

    const result = normalizeStructuredEntityRefs(content, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')

    assert.equal(
        result,
        [
            'Read [Roadmap](/w/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/knowledge/11111111-1111-1111-1111-111111111111)',
            'Then [Chat: Sprint Sync](/w/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/agent/22222222-2222-2222-2222-222222222222)',
            'Inside [Workspace: Ops](/w/33333333-3333-3333-3333-333333333333).',
        ].join('\n'),
    )
})

test('normalizeStructuredEntityRefs leaves unrelated text untouched', () => {
    const content = 'No structured entity references here.'

    assert.equal(
        normalizeStructuredEntityRefs(content, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
        content,
    )
})

test('renderAgentMessageContent renders structured entity refs as plain links without legacy card markup', () => {
    const html = renderAgentMessageContent(
        'Use [[knowledge:11111111-1111-1111-1111-111111111111:Roadmap]] next.',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    )

    assert.match(html, /<a href="\/w\/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\/knowledge\/11111111-1111-1111-1111-111111111111">Roadmap<\/a>/)
    assert.doesNotMatch(html, /entity-link/)
    assert.doesNotMatch(html, /entity-link-badge/)
    assert.doesNotMatch(html, />Knowledge</)
})

test('renderAgentMessageContent keeps legacy id-link cases as plain anchors during streaming', () => {
    const html = renderAgentMessageContent(
        'knowledge_id: 11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    )

    assert.match(html, /knowledge_id:\s*<a href="\/w\/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\/knowledge\/11111111-1111-1111-1111-111111111111">11111111/)
    assert.doesNotMatch(html, /entity-link/)
    assert.doesNotMatch(html, /entity-link-badge/)
})
