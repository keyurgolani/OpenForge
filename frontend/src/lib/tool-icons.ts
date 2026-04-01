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
  // platform.* tool IDs
  'platform.agent.invoke': GitBranch,
  'platform.agent.list_agents': GitBranch,
  'platform.agent.get_agent': GitBranch,
  'platform.chat.list_chats': GitBranch,
  'platform.chat.read_chat': GitBranch,
  'platform.workspace.search': Search,
  'platform.workspace.save_knowledge': Database,
  'platform.workspace.list_knowledge': Database,
  'platform.workspace.delete_knowledge': Database,
  'platform.workspace.list_workspaces': Database,
  'platform.workspace.get_workspace': Database,
  'platform.automation.list': Wrench,
  'platform.automation.get': Wrench,
  'platform.automation.create': Wrench,
  'platform.automation.update': Wrench,
  'platform.automation.delete': Wrench,
  'platform.deployment.list': Wrench,
  'platform.deployment.get': Wrench,
  'platform.deployment.deploy': Wrench,
  'platform.deployment.pause': Wrench,
  'platform.deployment.resume': Wrench,
  'platform.deployment.teardown': Wrench,
  'platform.deployment.run_now': Wrench,
  'platform.sink.list': Wrench,
  'platform.sink.get': Wrench,
  'platform.sink.create': Wrench,
  'platform.sink.update': Wrench,
  'platform.sink.delete': Wrench,
}

export function getToolIcon(toolName: string): LucideIcon {
  return TOOL_ICON_MAP[toolName] ?? Wrench
}
