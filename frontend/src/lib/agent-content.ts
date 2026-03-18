import MarkdownIt from 'markdown-it'
import { chatRoute, dashboardRoute, knowledgeRoute } from '@/lib/routes'

const md = new MarkdownIt({ html: false, linkify: true, typographer: true, breaks: true })
const STRUCTURED_ENTITY_RE = /\[\[(knowledge|chat|workspace):([a-f0-9-]+):([^\]]+)\]\]/gi
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export interface MentionResolutionMaps {
    workspacesById: Map<string, string>
    chatsById: Map<string, string>
    knowledgeById: Map<string, string>
    knowledgeTypeById: Map<string, string>
    knowledgeWorkspaceById: Map<string, { workspaceId: string; workspaceName: string }>
    workspacesByName: Map<string, string>
    chatsByName: Map<string, string>
}

function shortEntityLabel(uuid: string): string {
    return `${uuid.slice(0, 8)}…`
}

export function normalizeStructuredEntityRefs(content: string, workspaceId: string): string {
    return content.replace(STRUCTURED_ENTITY_RE, (_match, type: string, uuid: string, title: string) => {
        const entityType = String(type).toLowerCase()
        if (entityType === 'knowledge') {
            return `[${title}](${knowledgeRoute(workspaceId, uuid)})`
        }
        if (entityType === 'chat') {
            return `[Chat: ${title}](${chatRoute(workspaceId, uuid)})`
        }
        if (entityType === 'workspace') {
            return `[Workspace: ${title}](${dashboardRoute(uuid)})`
        }
        return title
    })
}

function injectIdLinks(
    content: string,
    workspaceId: string,
    maps?: MentionResolutionMaps,
): string {
    let out = content.replace(
        new RegExp(`(knowledge_id\\s*[:=]\\s*\`?)(${UUID_PATTERN})(\`?)`, 'gi'),
        (_, pre, uuid: string, post) => {
            const knowledgeId = uuid.toLowerCase()
            const title = maps?.knowledgeById.get(knowledgeId) ?? shortEntityLabel(uuid)
            const targetWorkspaceId = maps?.knowledgeWorkspaceById.get(knowledgeId)?.workspaceId ?? workspaceId
            return `${pre}[${title}](${knowledgeRoute(targetWorkspaceId, uuid)})${post}`
        },
    )

    out = out.replace(
        new RegExp(`((?:conversation_id|chat_id)\\s*[:=]\\s*\`?)(${UUID_PATTERN})(\`?)`, 'gi'),
        (_, pre, uuid: string, post) => {
            const title = maps?.chatsById.get(uuid.toLowerCase()) ?? shortEntityLabel(uuid)
            return `${pre}[Chat: ${title}](${chatRoute(workspaceId, uuid)})${post}`
        },
    )

    out = out.replace(
        new RegExp(`(workspace_id\\s*[:=]\\s*\`?)(${UUID_PATTERN})(\`?)`, 'gi'),
        (_, pre, uuid: string, post) => {
            const name = maps?.workspacesById.get(uuid.toLowerCase()) ?? shortEntityLabel(uuid)
            return `${pre}[Workspace: ${name}](${dashboardRoute(uuid)})${post}`
        },
    )

    if (maps) {
        const workspaceNames = [...maps.workspacesByName.entries()].sort((a, b) => b[0].length - a[0].length)
        for (const [nameLower, workspaceRefId] of workspaceNames) {
            const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            out = out.replace(
                new RegExp(`@(${escapedName})(?![^[]*\\])`, 'gi'),
                (_, matched) => `[@${matched}](${dashboardRoute(workspaceRefId)})`,
            )
        }

        const chatNames = [...maps.chatsByName.entries()].sort((a, b) => b[0].length - a[0].length)
        for (const [nameLower, chatId] of chatNames) {
            const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            out = out.replace(
                new RegExp(`@(${escapedName})(?![^[]*\\])`, 'gi'),
                (_, matched) => `[@${matched}](${chatRoute(workspaceId, chatId)})`,
            )
        }

        out = out.replace(
            new RegExp(`(?<![/\\w-])(${UUID_PATTERN})(?![/\\w-])`, 'gi'),
            (uuid: string) => {
                const entityId = uuid.toLowerCase()
                const workspaceName = maps.workspacesById.get(entityId)
                if (workspaceName) return `[Workspace: ${workspaceName}](${dashboardRoute(uuid)})`

                const chatTitle = maps.chatsById.get(entityId)
                if (chatTitle) return `[Chat: ${chatTitle}](${chatRoute(workspaceId, uuid)})`

                const knowledgeTitle = maps.knowledgeById.get(entityId) ?? shortEntityLabel(uuid)
                const targetWorkspaceId = maps.knowledgeWorkspaceById.get(entityId)?.workspaceId ?? workspaceId
                return `[${knowledgeTitle}](${knowledgeRoute(targetWorkspaceId, uuid)})`
            },
        )
    }

    return out
}

export function renderAgentMessageContent(
    content: string,
    workspaceId: string,
    maps?: MentionResolutionMaps,
): string {
    const normalizedContent = normalizeStructuredEntityRefs(content, workspaceId)
    return md.render(injectIdLinks(normalizedContent, workspaceId, maps))
}
