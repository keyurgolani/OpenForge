import type { LucideIcon } from 'lucide-react'
import { Search, FileText, Terminal, Globe, Database, Mail, GitBranch, Wrench } from 'lucide-react'

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  search_web: Search,
  search: Search,
  read_file: FileText,
  read_url: FileText,
  execute_code: Terminal,
  fetch_page: Globe,
  save_knowledge: Database,
  search_workspace: Database,
  list_knowledge: Database,
  delete_knowledge: Database,
  send_email: Mail,
  'agent.invoke': GitBranch,
}

export function getToolIcon(toolName: string): LucideIcon {
  return TOOL_ICON_MAP[toolName] ?? Wrench
}
