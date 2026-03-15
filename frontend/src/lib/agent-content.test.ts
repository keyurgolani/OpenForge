import { describe, expect, it } from 'vitest'

import { normalizeStructuredEntityRefs, renderAgentMessageContent } from './agent-content.ts'

describe('agent-content', () => {
    it('normalizeStructuredEntityRefs converts structured OpenForge entity refs to markdown links', () => {
        const content = [
            'Read [[knowledge:11111111-1111-1111-1111-111111111111:Roadmap]]',
            'Then [[chat:22222222-2222-2222-2222-222222222222:Sprint Sync]]',
            'Inside [[workspace:33333333-3333-3333-3333-333333333333:Ops]].',
        ].join('\n')

        const result = normalizeStructuredEntityRefs(content, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')

        expect(result).toBe(
            [
                'Read [Roadmap](/w/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/knowledge/11111111-1111-1111-1111-111111111111)',
                'Then [Chat: Sprint Sync](/w/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/chat/22222222-2222-2222-2222-222222222222)',
                'Inside [Workspace: Ops](/w/33333333-3333-3333-3333-333333333333).',
            ].join('\n'),
        )
    })

    it('normalizeStructuredEntityRefs leaves unrelated text untouched', () => {
        const content = 'No structured entity references here.'

        expect(normalizeStructuredEntityRefs(content, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(content)
    })

    it('renderAgentMessageContent renders structured entity refs as plain links without legacy card markup', () => {
        const html = renderAgentMessageContent(
            'Use [[knowledge:11111111-1111-1111-1111-111111111111:Roadmap]] next.',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        )

        expect(html).toMatch(/<a href="\/w\/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\/knowledge\/11111111-1111-1111-1111-111111111111">Roadmap<\/a>/)
        expect(html).not.toMatch(/entity-link/)
        expect(html).not.toMatch(/entity-link-badge/)
        expect(html).not.toMatch(/>Knowledge</)
    })

    it('renderAgentMessageContent keeps legacy id-link cases as plain anchors during streaming', () => {
        const html = renderAgentMessageContent(
            'knowledge_id: 11111111-1111-1111-1111-111111111111',
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        )

        expect(html).toMatch(/knowledge_id:\s*<a href="\/w\/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\/knowledge\/11111111-1111-1111-1111-111111111111">11111111/)
        expect(html).not.toMatch(/entity-link/)
        expect(html).not.toMatch(/entity-link-badge/)
    })
})
