# Phase 14 Critical User Journeys

## Purpose

This document defines the critical user journeys that must pass end-to-end on every release candidate build. Each journey includes prerequisites, detailed steps, expected outcomes, and documented failure states. These journeys validate that the core product experience works as intended.

---

## Journey 1: First Workspace Setup

### Prerequisites
- Fresh OpenForge deployment (Docker Compose) with no existing data
- At least one LLM provider configured via environment variables or ready to configure in UI

### Steps
1. Navigate to the application root (http://localhost:3100)
2. If ADMIN_PASSWORD is set, authenticate via the login page
3. Land on the onboarding page or workspace creation prompt
4. Enter a workspace name and optional description
5. Confirm workspace creation
6. Land on the Workspace Home page with the new workspace context active

### Expected Outcomes
- Workspace is created in the database with a valid UUID
- Workspace directory is created under WORKSPACE_ROOT
- Workspace Home page renders with the workspace name in the navigation
- Sidebar navigation shows all core sections: Chat, Knowledge, Profiles, Workflows, Missions, Runs, Artifacts, Catalog, Search
- Catalog seeder has populated curated items (viewable under Catalog)

### Failure States
- **Onboarding page does not load**: Check that the frontend build is healthy and the API is reachable
- **Workspace creation returns 500**: Check database connectivity and migration status
- **Sidebar is empty or missing sections**: Check frontend routing configuration
- **Catalog is empty after first boot**: Check that the catalog seeder ran during application startup

---

## Journey 2: Import and Initial Knowledge Ingestion

### Prerequisites
- Workspace exists and is selected
- At least one test document available (PDF, text, or markdown file)
- Qdrant service is healthy

### Steps
1. Navigate to the Knowledge page within the workspace
2. Click the upload/import action
3. Select a test document from the local filesystem
4. Confirm the upload
5. Observe the processing status (pending -> processing -> completed)
6. Verify the document appears in the knowledge list with metadata

### Expected Outcomes
- File is uploaded to the UPLOADS_ROOT volume
- Attachment pipeline processes the file (extraction, chunking, embedding)
- Chunks are stored in Qdrant with workspace-scoped collection
- Knowledge list shows the document with its title, type, and processing status
- Processing completes within 30 seconds for a standard document

### Failure States
- **Upload returns 413 or fails silently**: Check file size limits in the API and reverse proxy
- **Processing stays in "pending" forever**: Check Celery worker health and Redis connectivity
- **Qdrant indexing fails**: Check Qdrant service health, collection creation, and embedding model availability
- **Document appears but shows "failed" status**: Check processing logs for extraction errors (e.g., unsupported format, corrupt file)

---

## Journey 3: First Chat and Retrieval-Backed Answer

### Prerequisites
- Workspace exists with at least one ingested knowledge document
- LLM provider is configured and reachable
- Retrieval pipeline is functional (Qdrant healthy, embeddings indexed)

### Steps
1. Navigate to the Workspace Agent (chat) page
2. Start a new conversation
3. Type a question that is answerable from the ingested knowledge
4. Send the message
5. Observe the streaming response
6. Verify the response includes citations or references to the knowledge source

### Expected Outcomes
- WebSocket connection establishes for streaming
- Retrieval query is generated from the user message
- Evidence packets are assembled from vector search results
- LLM receives the evidence context and generates a grounded answer
- Response streams to the UI with visible tokens
- Citations or source references are present in the response
- Conversation is persisted in the database

### Failure States
- **WebSocket fails to connect**: Check that the WebSocket endpoint is accessible and not blocked by proxy
- **Response has no citations**: Check retrieval pipeline; evidence packets may be empty if embeddings are missing
- **Response is generic (not grounded in knowledge)**: Check that the retrieval query matched relevant chunks; may indicate embedding quality issue
- **Streaming hangs after first token**: Check LLM provider connectivity and timeout configuration
- **500 error on message send**: Check AgentExecutionEngine logs for pipeline failures

---

## Journey 4: Browsing Profiles, Workflows, and Missions Catalog

### Prerequisites
- Workspace exists
- Catalog seeder has run (curated items are populated)

### Steps
1. Navigate to the Catalog page
2. Browse available profiles, workflows, and missions
3. Filter by item type (profile, workflow, mission)
4. Filter by difficulty level (beginner, intermediate, advanced)
5. Click on a catalog item to view its detail page
6. Verify the detail page shows description, difficulty, setup complexity, and clone behavior

### Expected Outcomes
- Catalog page loads with all curated items within 500ms
- Items are displayed as cards with title, description, type badge, and difficulty indicator
- Filtering by type shows only items of that type
- Filtering by difficulty shows only items at that level
- Detail page renders all metadata fields accurately
- Clone/use action button is visible on the detail page

### Failure States
- **Catalog page is empty**: Check that the catalog seeder ran; verify database has catalog entries
- **Filtering produces no results when items exist**: Check frontend filter logic and API query parameters
- **Detail page returns 404**: Check that the catalog item ID in the URL is valid
- **Difficulty or complexity badges are missing**: Check that the seeder populated these fields

---

## Journey 5: Cloning and Customizing a Workflow or Mission

### Prerequisites
- Workspace exists
- Catalog has at least one workflow and one mission with clone_only or editable_after_clone behavior

### Steps
1. Navigate to the Catalog page
2. Select a workflow with clone behavior "editable_after_clone"
3. Click the Clone action
4. Confirm cloning into the current workspace
5. Navigate to the Workflows page and verify the cloned workflow appears
6. Open the cloned workflow detail page
7. Modify a property (e.g., rename, change a node configuration)
8. Save changes
9. Repeat steps 2-8 for a Mission

### Expected Outcomes
- Clone creates a workspace-local copy of the catalog item
- Cloned workflow appears in the workspace Workflows list with a new UUID
- Cloned workflow is editable (for editable_after_clone items)
- Modifications save successfully and persist on page reload
- Original catalog item is unchanged
- Cloned mission appears in the workspace Missions list

### Failure States
- **Clone action returns error**: Check catalog service clone logic and database constraints
- **Cloned item is not editable**: Check that clone behavior type was correctly propagated
- **Clone creates a duplicate reference instead of a copy**: Check that clone creates new database records with new UUIDs
- **System-locked items allow cloning**: Verify that system_locked items show appropriate UI state (view-only, no clone button)

---

## Journey 6: Running a Mission Manually

### Prerequisites
- Workspace exists with at least one mission (cloned from catalog or manually created)
- Mission has a valid workflow association
- LLM provider configured

### Steps
1. Navigate to the Missions page
2. Select a mission
3. Click "Run Now" or equivalent manual execution action
4. Observe that a new Run is created
5. Navigate to the Runs page and verify the run appears
6. Open the Run detail page
7. Observe run progression through steps (pending -> running -> completed)

### Expected Outcomes
- Manual mission execution creates a Run record immediately
- Run appears in the Runs list within 2 seconds of creation
- Run detail page shows real-time step progression
- Each step shows its status, duration, and any output
- Run completes successfully with a final "completed" status
- Artifacts produced by the run (if any) are linked and visible

### Failure States
- **Run stays in "pending"**: Check Celery worker health; the execution engine may not be picking up the task
- **Run fails immediately**: Check run detail for the error; common causes include missing LLM provider, invalid workflow definition, or tool server unavailability
- **Run completes but no artifacts**: Check artifact sink configuration in the workflow nodes
- **Mission health degrades after run failure**: Verify mission health state machine transitions (healthy -> degraded -> unhealthy based on consecutive failures)

---

## Journey 7: Reviewing Runs and Artifacts

### Prerequisites
- At least one completed run exists with artifacts

### Steps
1. Navigate to the Runs page
2. View the runs list; verify sorting by most recent
3. Click on a completed run to view its detail
4. On the Run detail page, inspect the step list
5. Click on individual steps to see step details (inputs, outputs, duration)
6. Navigate to the Artifacts tab/section of the run
7. Click on an artifact to view its detail page
8. Verify artifact version history is present
9. Verify artifact links (parent run, related artifacts) are navigable

### Expected Outcomes
- Runs list loads within 500ms, sorted by creation time descending
- Run detail page shows all steps in execution order
- Each step shows status, start/end time, and duration
- Artifacts section lists all artifacts produced by the run
- Artifact detail page shows the current version and version history
- Artifact links (ArtifactLinkModel) show relationships between artifacts
- Navigating from artifact back to the producing run works correctly

### Failure States
- **Runs list is slow (>500ms)**: Check database indexing on run table
- **Steps are out of order**: Check step ordering logic in the API
- **Artifact detail returns 404**: Check that artifact IDs are correctly associated with the run
- **Version history is missing**: Check ArtifactVersionModel records exist for the artifact
- **Links between artifacts are broken**: Check ArtifactLinkModel foreign key integrity

---

## Journey 8: Handling Approvals

### Prerequisites
- A workflow or mission exists that includes an HITL (human-in-the-loop) approval node
- A run is in progress or can be triggered that will reach the approval node

### Steps
1. Trigger a run that includes an HITL approval step
2. Observe the run pauses at the approval node (status changes to "waiting_approval" or equivalent)
3. Navigate to the Approvals page
4. Verify the pending approval appears in the inbox
5. Click on the approval to see its detail (what is being approved, context, requester)
6. **Approve path**: Click "Approve" and confirm
7. Verify the run resumes and progresses past the approval node
8. **Reject path**: Trigger another run, reach the approval node again
9. Click "Reject" and provide a reason
10. Verify the run handles the rejection (fails gracefully or takes an alternate path)

### Expected Outcomes
- Run pauses correctly at the HITL node without consuming further resources
- Approval appears in the inbox within seconds of the run reaching the HITL node
- Approval detail shows sufficient context for the operator to make a decision
- Approving resumes the run via the `resume_after_hitl` Celery task
- Run continues from the checkpoint after approval (no re-execution of prior steps)
- Rejecting causes the run to fail or follow a rejection branch
- Approval status updates in the inbox (resolved/approved or resolved/rejected)

### Failure States
- **Run does not pause at HITL node**: Check HITL service integration in the execution engine
- **Approval does not appear in inbox**: Check that the HITL request was persisted to the database
- **Resume after approval fails**: Check Celery worker health and checkpoint integrity
- **Run re-executes prior steps after resume**: Check checkpoint store; state may not have been persisted
- **Rejection does not stop the run**: Check that the execution engine handles rejection status correctly

---

## Journey 9: Inspecting Entities/Knowledge Relationships

### Prerequisites
- Workspace has ingested knowledge with extractable entities (e.g., documents mentioning people, organizations, technologies)
- Graph extraction has completed for the knowledge

### Steps
1. Navigate to the Search page or a dedicated entity/graph view
2. Search for a known entity (e.g., a person or concept from ingested documents)
3. View the entity detail, including aliases and mentions
4. Inspect relationships between the entity and other entities
5. Navigate along relationships to related entities
6. Verify provenance links connect entities back to source knowledge

### Expected Outcomes
- Entity search returns relevant results from the graph
- Entity detail page shows: canonical name, aliases (EntityAliasModel), mentions (EntityMentionModel)
- Relationships (RelationshipModel) are displayed with type labels and directionality
- Clicking a related entity navigates to its detail page
- Provenance links (GraphProvenanceLinkModel) connect to the source document/chunk
- Graph query completes within 2 seconds

### Failure States
- **No entities found**: Check that graph extraction ran successfully on the ingested knowledge
- **Entity has no relationships**: Check RelationshipModel records; extraction may have found entities but not relationships
- **Provenance links are broken**: Check GraphProvenanceLinkModel foreign keys to knowledge records
- **Graph query is slow (>2s)**: Check database indexing on entity and relationship tables

---

## Journey 10: Using Operator/Debug Surfaces When Something Goes Wrong

### Prerequisites
- At least one failed run exists (can be artificially triggered)
- Observability data is populated (usage, failures)

### Steps
1. Navigate to the Operator Dashboard
2. Review the usage summary (total tokens, cost, request count)
3. Review the failure events list
4. Filter failures by severity (blocker, major, minor)
5. Click on a specific failure event to inspect detail
6. Verify the failure event references the affected run, step, workflow, or mission
7. Navigate from the failure event to the affected run's detail page
8. On the run detail page, identify the failed step
9. Review the step's error detail and runtime events
10. Check the cost hotspot view to identify expensive workflows or models

### Expected Outcomes
- Operator Dashboard loads within 1 second
- Usage summary shows accurate totals (cross-referenced with known test data)
- Failure list shows all failures with: class, severity, retryability, summary
- Failure detail includes: error_code, affected_node_key, related entity IDs
- Navigation from failure to run detail works correctly
- Failed step shows clear error information (not just "internal error")
- Cost hotspots identify the top-spending entities with cost and token counts
- Failure rollup groups failures by class/severity with counts and last-seen timestamps

### Failure States
- **Operator Dashboard is blank**: Check observability router is registered and returning data
- **Usage summary shows all zeros**: Check that RuntimeEventModel records are being created during runs
- **Failure events are missing**: Check that the execution engine publishes failure events via EventPublisher
- **Navigation from failure to run returns 404**: Check that run_id in the failure event is valid
- **Cost hotspots are empty**: Check that cost data is being tracked per-request in the usage model

---

## Test Execution Tracking

| Journey | RC Build | Tester | Pass/Fail | Notes |
|---------|----------|--------|-----------|-------|
| 1. First workspace setup | | | | |
| 2. Knowledge ingestion | | | | |
| 3. Chat with retrieval | | | | |
| 4. Catalog browsing | | | | |
| 5. Clone and customize | | | | |
| 6. Manual mission run | | | | |
| 7. Review runs/artifacts | | | | |
| 8. Handle approvals | | | | |
| 9. Entity/knowledge graph | | | | |
| 10. Operator debug | | | | |
