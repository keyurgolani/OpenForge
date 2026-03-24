import { describe, expect, it } from 'vitest'
import { getToolIcon } from '@/lib/tool-icons'
import { Search, FileText, Terminal, Globe, Database, Mail, GitBranch, Wrench } from 'lucide-react'

describe('getToolIcon', () => {
  it('maps search tools to Search icon', () => {
    expect(getToolIcon('search_web')).toBe(Search)
    expect(getToolIcon('search')).toBe(Search)
  })

  it('maps file tools to FileText icon', () => {
    expect(getToolIcon('read_file')).toBe(FileText)
    expect(getToolIcon('read_url')).toBe(FileText)
  })

  it('maps code tools to Terminal icon', () => {
    expect(getToolIcon('execute_code')).toBe(Terminal)
  })

  it('maps fetch tools to Globe icon', () => {
    expect(getToolIcon('fetch_page')).toBe(Globe)
  })

  it('maps knowledge tools to Database icon', () => {
    expect(getToolIcon('save_knowledge')).toBe(Database)
    expect(getToolIcon('search_workspace')).toBe(Database)
  })

  it('maps email tools to Mail icon', () => {
    expect(getToolIcon('send_email')).toBe(Mail)
  })

  it('maps agent.invoke to GitBranch icon', () => {
    expect(getToolIcon('agent.invoke')).toBe(GitBranch)
  })

  it('falls back to Wrench for unknown tools', () => {
    expect(getToolIcon('unknown_tool')).toBe(Wrench)
    expect(getToolIcon('')).toBe(Wrench)
  })
})
