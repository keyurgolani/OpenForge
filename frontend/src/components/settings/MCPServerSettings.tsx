/**
 * MCP Server Settings Component
 *
 * UI for managing external MCP server connections.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    listMCPServers, createMCPServer, updateMCPServer, deleteMCPServer,
    discoverMCPTools, listMCPServerTools, setMCPToolOverride,
} from '@/lib/api'
import {
    Server, Plus, Trash2, RefreshCw, Loader2, CheckCircle, XCircle,
    ChevronDown, ChevronUp, Shield, Eye, EyeOff, Power, Search,
} from 'lucide-react'

interface MCPServerSettingsProps {
    className?: string
}

export function MCPServerSettings({ className = '' }: MCPServerSettingsProps) {
    const queryClient = useQueryClient()
    const [expandedServer, setExpandedServer] = useState<string | null>(null)
    const [showAddForm, setShowAddForm] = useState(false)
    const [newServer, setNewServer] = useState({
        name: '',
        url: '',
        description: '',
        auth_type: 'none',
        auth_value: '',
        default_risk_level: 'high',
    })
    const [showAuthValue, setShowAuthValue] = useState(false)

    // Fetch MCP servers
    const { data: serversData, isLoading } = useQuery({
        queryKey: ['mcp-servers'],
        queryFn: listMCPServers,
    })

    // Create server mutation
    const createMutation = useMutation({
        mutationFn: createMCPServer,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
            setShowAddForm(false)
            setNewServer({
                name: '',
                url: '',
                description: '',
                auth_type: 'none',
                auth_value: '',
                default_risk_level: 'high',
            })
        },
    })

    // Delete server mutation
    const deleteMutation = useMutation({
        mutationFn: deleteMCPServer,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
        },
    })

    // Toggle server enabled mutation
    const toggleMutation = useMutation({
        mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
            updateMCPServer(id, { is_enabled }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
        },
    })

    // Discover tools mutation
    const discoverMutation = useMutation({
        mutationFn: discoverMCPTools,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
        },
    })

    const handleCreate = () => {
        if (!newServer.name || !newServer.url) return
        createMutation.mutate(newServer)
    }

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this MCP server?')) {
            deleteMutation.mutate(id)
        }
    }

    const servers = serversData?.servers || []

    return (
        <div className={`space-y-6 ${className}`}>
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Server className="w-5 h-5 text-purple-400" />
                        MCP Servers
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Connect external MCP servers for additional tools
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30
                             text-purple-300 rounded-lg text-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Add Server
                </button>
            </div>

            {/* Add Server Form */}
            {showAddForm && (
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-medium text-white">Add New MCP Server</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Name *</label>
                            <input
                                type="text"
                                value={newServer.name}
                                onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white
                                         text-sm focus:outline-none focus:border-purple-500"
                                placeholder="My MCP Server"
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">URL *</label>
                            <input
                                type="text"
                                value={newServer.url}
                                onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white
                                         text-sm focus:outline-none focus:border-purple-500"
                                placeholder="http://localhost:3002"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Description</label>
                        <input
                            type="text"
                            value={newServer.description}
                            onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white
                                     text-sm focus:outline-none focus:border-purple-500"
                            placeholder="Optional description"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Auth Type</label>
                            <select
                                value={newServer.auth_type}
                                onChange={(e) => setNewServer({ ...newServer, auth_type: e.target.value })}
                                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white
                                         text-sm focus:outline-none focus:border-purple-500"
                            >
                                <option value="none">None</option>
                                <option value="bearer">Bearer Token</option>
                                <option value="api_key">API Key</option>
                                <option value="header">Custom Header</option>
                            </select>
                        </div>
                        {newServer.auth_type !== 'none' && (
                            <div className="col-span-2">
                                <label className="block text-xs text-gray-400 mb-1">Auth Value</label>
                                <div className="relative">
                                    <input
                                        type={showAuthValue ? 'text' : 'password'}
                                        value={newServer.auth_value}
                                        onChange={(e) => setNewServer({ ...newServer, auth_value: e.target.value })}
                                        className="w-full px-3 py-2 pr-10 bg-gray-900 border border-gray-600 rounded-lg text-white
                                                 text-sm focus:outline-none focus:border-purple-500"
                                        placeholder="Enter auth value"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowAuthValue(!showAuthValue)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                    >
                                        {showAuthValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 mb-1">Default Risk Level</label>
                        <select
                            value={newServer.default_risk_level}
                            onChange={(e) => setNewServer({ ...newServer, default_risk_level: e.target.value })}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white
                                     text-sm focus:outline-none focus:border-purple-500"
                        >
                            <option value="low">Low (auto-approve)</option>
                            <option value="medium">Medium (warn)</option>
                            <option value="high">High (require approval)</option>
                            <option value="critical">Critical (always block)</option>
                        </select>
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleCreate}
                            disabled={!newServer.name || !newServer.url || createMutation.isPending}
                            className="flex items-center gap-2 px-4 py-1.5 bg-purple-500 hover:bg-purple-600
                                     disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg
                                     text-sm transition-colors"
                        >
                            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                            Add Server
                        </button>
                    </div>
                </div>
            )}

            {/* Server List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                </div>
            ) : servers.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                    <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No MCP servers configured</p>
                    <p className="text-sm mt-1">Add a server to enable external tools</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {servers.map((server: any) => (
                        <MCPServerCard
                            key={server.id}
                            server={server}
                            isExpanded={expandedServer === server.id}
                            onToggleExpand={() => setExpandedServer(
                                expandedServer === server.id ? null : server.id
                            )}
                            onToggleEnabled={(is_enabled) => toggleMutation.mutate({ id: server.id, is_enabled })}
                            onDelete={() => handleDelete(server.id)}
                            onDiscover={() => discoverMutation.mutate(server.id)}
                            isDeleting={deleteMutation.isPending}
                            isDiscovering={discoverMutation.isPending}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

// Server Card Component
interface MCPServerCardProps {
    server: any
    isExpanded: boolean
    onToggleExpand: () => void
    onToggleEnabled: (is_enabled: boolean) => void
    onDelete: () => void
    onDiscover: () => void
    isDeleting: boolean
    isDiscovering: boolean
}

function MCPServerCard({
    server,
    isExpanded,
    onToggleExpand,
    onToggleEnabled,
    onDelete,
    onDiscover,
    isDeleting,
    isDiscovering,
}: MCPServerCardProps) {
    const { data: toolsData, isLoading: isLoadingTools } = useQuery({
        queryKey: ['mcp-server-tools', server.id],
        queryFn: () => listMCPServerTools(server.id),
        enabled: isExpanded,
    })

    const riskColors: Record<string, string> = {
        low: 'text-green-400',
        medium: 'text-yellow-400',
        high: 'text-orange-400',
        critical: 'text-red-400',
    }

    return (
        <div className={`bg-gray-800/50 border rounded-xl overflow-hidden ${
            server.is_enabled ? 'border-gray-700' : 'border-gray-800 opacity-60'
        }`}>
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/30"
                onClick={onToggleExpand}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                        server.is_enabled ? 'bg-green-400' : 'bg-gray-500'
                    }`} />
                    <div>
                        <h3 className="font-medium text-white">{server.name}</h3>
                        <p className="text-xs text-gray-400">{server.url}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <span className={`text-xs ${riskColors[server.default_risk_level]}`}>
                        <Shield className="w-3 h-3 inline mr-1" />
                        {server.default_risk_level}
                    </span>
                    <span className="text-xs text-gray-400">
                        {server.tool_count || 0} tools
                    </span>
                    {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="border-t border-gray-700 p-4 space-y-4">
                    {server.description && (
                        <p className="text-sm text-gray-400">{server.description}</p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleEnabled(!server.is_enabled) }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                                server.is_enabled
                                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                            }`}
                        >
                            <Power className="w-3 h-3" />
                            {server.is_enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDiscover() }}
                            disabled={isDiscovering}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 hover:bg-blue-500/30
                                     text-blue-300 rounded text-xs transition-colors disabled:opacity-50"
                        >
                            {isDiscovering ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <RefreshCw className="w-3 h-3" />
                            )}
                            Discover
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete() }}
                            disabled={isDeleting}
                            className="flex items-center gap-1.5 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30
                                     text-red-300 rounded text-xs transition-colors disabled:opacity-50"
                        >
                            {isDeleting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <Trash2 className="w-3 h-3" />
                            )}
                            Delete
                        </button>
                    </div>

                    {/* Tools List */}
                    <div>
                        <h4 className="text-xs font-medium text-gray-300 mb-2">Discovered Tools</h4>
                        {isLoadingTools ? (
                            <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            </div>
                        ) : toolsData?.tools?.length > 0 ? (
                            <div className="max-h-60 overflow-y-auto space-y-1">
                                {toolsData.tools.map((tool: any) => (
                                    <div
                                        key={tool.name}
                                        className="flex items-center justify-between p-2 bg-gray-900/50 rounded"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-white truncate">{tool.name}</p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {tool.description || 'No description'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 ml-2">
                                            <span className={`text-xs ${riskColors[tool.risk_level]}`}>
                                                {tool.risk_level}
                                            </span>
                                            {tool.has_override && (
                                                <span className="text-xs text-purple-400">*</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500 py-2">
                                No tools discovered. Click "Discover" to fetch tools.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default MCPServerSettings
