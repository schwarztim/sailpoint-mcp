# Architecture Decision Records

This document captures key architectural decisions made for the SailPoint MCP Server, following the ADR (Architecture Decision Record) format.

## ADR Index

| ID | Title | Status | Date |
|----|-------|--------|------|
| ADR-001 | Use Model Context Protocol for AI integration | Accepted | 2025-01-16 |
| ADR-002 | Single TypeScript file architecture | Accepted | 2025-01-16 |
| ADR-003 | OAuth 2.0 client credentials flow | Accepted | 2025-01-16 |
| ADR-004 | stdio transport for MCP communication | Accepted | 2025-01-16 |
| ADR-005 | Stateless design with no persistent storage | Accepted | 2025-01-16 |
| ADR-006 | Pass-through API responses | Accepted | 2025-01-16 |
| ADR-007 | Environment variable configuration | Accepted | 2025-01-16 |

---

## ADR-001: Use Model Context Protocol for AI Integration

### Status

Accepted

### Context

We need to enable AI assistants (like Claude) to interact with SailPoint Identity Security Cloud for identity governance operations. Several integration approaches were considered:

1. **Direct API integration** - AI calls SailPoint API directly
2. **Custom REST API wrapper** - Build a REST API that AI can call
3. **Model Context Protocol (MCP)** - Use the emerging MCP standard

### Decision

We will implement the integration using the Model Context Protocol (MCP).

### Rationale

- **Standardization**: MCP is an emerging standard for AI-tool integration supported by Anthropic
- **Tool Discovery**: MCP provides built-in tool discovery and schema definition
- **Type Safety**: MCP SDK provides TypeScript types for protocol compliance
- **Ecosystem**: Growing ecosystem of MCP hosts (Claude Desktop, IDE extensions)
- **Simplicity**: Single protocol for AI interaction vs. building custom REST APIs

### Consequences

**Positive:**
- Standard protocol reduces integration complexity
- Built-in tool discovery and documentation
- Compatible with multiple MCP hosts
- Strong TypeScript support

**Negative:**
- Limited to MCP-compatible hosts
- Relatively new protocol with evolving specification
- stdio transport limits deployment options

### Alternatives Considered

| Alternative | Pros | Cons |
|-------------|------|------|
| Direct API integration | No middleware | Requires AI to understand SailPoint API |
| REST API wrapper | Widely compatible | Additional infrastructure needed |
| GraphQL | Flexible queries | Complex schema management |

---

## ADR-002: Single TypeScript File Architecture

### Status

Accepted

### Context

We need to decide on the code organization for the MCP server. Options include:

1. **Single file** - All code in one index.ts file
2. **Multi-module** - Separate files for tools, handlers, client
3. **Plugin architecture** - Dynamically loaded tool modules

### Decision

We will use a single TypeScript file (`src/index.ts`) containing all server code.

### Rationale

- **Simplicity**: Small codebase (~1400 lines) fits comfortably in one file
- **Minimal Dependencies**: No module resolution complexity
- **Easy Deployment**: Single compiled output
- **Quick Navigation**: All code visible without jumping between files
- **MVP Approach**: Fastest path to working solution

### Consequences

**Positive:**
- Simple to understand and modify
- Fast compilation
- Easy to review and audit
- No import/export complexity

**Negative:**
- Harder to scale as features grow
- No separation of concerns at file level
- Code organization relies on comments and grouping
- Potential for merge conflicts with multiple developers

### Triggers for Reconsideration

- File exceeds 2000 lines
- Multiple developers working simultaneously
- Need to share code with other projects
- Testing requires mocking specific modules

---

## ADR-003: OAuth 2.0 Client Credentials Flow

### Status

Accepted

### Context

We need to authenticate with the SailPoint Identity Security Cloud API. SailPoint supports:

1. **Personal Access Tokens (PAT)** - Client credentials flow
2. **User authentication** - Authorization code flow
3. **API keys** - Direct key-based access (legacy)

### Decision

We will use OAuth 2.0 client credentials flow with Personal Access Tokens.

### Rationale

- **Official Support**: PATs are the recommended approach for service-to-service authentication
- **Scoped Access**: PATs can be scoped to specific permissions
- **Token Management**: Automatic token expiry and refresh
- **Auditability**: API calls attributed to PAT owner
- **No User Interaction**: Suitable for automated/background operations

### Consequences

**Positive:**
- Secure, time-limited tokens
- Granular permission scoping
- Audit trail attribution
- Standard OAuth 2.0 flow

**Negative:**
- Requires PAT creation and management
- Token expiry requires refresh logic
- PAT owner becomes audit attribution point

### Implementation Details

```typescript
// Token caching with 60-second pre-expiry buffer
let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && tokenExpiry > Date.now() + 60000) {
    return accessToken;
  }
  // Request new token...
}
```

---

## ADR-004: stdio Transport for MCP Communication

### Status

Accepted

### Context

MCP supports multiple transport mechanisms:

1. **stdio** - Standard input/output streams
2. **HTTP with SSE** - Server-Sent Events over HTTP
3. **WebSocket** - Bidirectional WebSocket connection

### Decision

We will use stdio transport for MCP communication.

### Rationale

- **MCP Standard**: stdio is the default transport for local MCP servers
- **Simplicity**: No network configuration required
- **Security**: Process isolation, no network exposure
- **Claude Desktop Compatibility**: Native support in Claude Desktop
- **No Port Conflicts**: Avoids port allocation issues

### Consequences

**Positive:**
- Zero network configuration
- Inherent process isolation
- Native MCP host support
- No firewall considerations

**Negative:**
- Limited to local process spawning
- Cannot deploy as standalone server
- No support for remote clients
- Single client per instance

### Future Considerations

For server deployment scenarios, consider adding HTTP/SSE transport:

```typescript
// Potential future addition
if (process.env.MCP_TRANSPORT === 'http') {
  const transport = new HttpServerTransport({ port: 3000 });
  await server.connect(transport);
}
```

---

## ADR-005: Stateless Design with No Persistent Storage

### Status

Accepted

### Context

We need to decide whether the MCP server should maintain state across requests:

1. **Stateless** - Each request is independent
2. **Session state** - Maintain state within a session
3. **Persistent state** - Store state across sessions (database, files)

### Decision

We will implement a stateless design with no persistent storage.

### Rationale

- **Simplicity**: No state management complexity
- **Security**: No sensitive data at rest
- **Scalability**: No shared state concerns
- **Reliability**: No state corruption risks
- **Compliance**: Easier data handling compliance

### Consequences

**Positive:**
- Simple mental model
- No data at rest security concerns
- No database dependencies
- Easy horizontal scaling (if needed)

**Negative:**
- No caching of frequently accessed data
- No session context between requests
- Repeated API calls for same data
- No offline capabilities

### State That Is Maintained

Only transient, in-memory state:

| State | Scope | Duration |
|-------|-------|----------|
| OAuth token | Module | Until expiry or process end |
| Token expiry time | Module | Until expiry or process end |

---

## ADR-006: Pass-Through API Responses

### Status

Accepted

### Context

We need to decide how to handle SailPoint API responses:

1. **Pass-through** - Return raw API responses
2. **Transform** - Normalize to a custom schema
3. **Aggregate** - Combine multiple API calls

### Decision

We will pass through SailPoint API responses with minimal transformation.

### Rationale

- **Fidelity**: Preserve all data from SailPoint
- **Simplicity**: No transformation logic to maintain
- **Flexibility**: Consumers can extract what they need
- **API Compatibility**: Matches SailPoint documentation
- **No Data Loss**: All fields available to consumer

### Consequences

**Positive:**
- Full data fidelity
- Easy to correlate with SailPoint docs
- No transformation bugs
- Simple implementation

**Negative:**
- Large response payloads
- Consumers must understand SailPoint schema
- No abstraction from API changes
- Inconsistent field naming across endpoints

### Minimal Transformations Applied

```typescript
// Search results include total count from header
case "search": {
  return {
    results: response.data,
    totalCount: response.headers["x-total-count"],
  };
}
```

---

## ADR-007: Environment Variable Configuration

### Status

Accepted

### Context

We need to decide how to configure the MCP server:

1. **Environment variables** - Standard shell/process environment
2. **Configuration file** - JSON/YAML config files
3. **Command-line arguments** - CLI flags
4. **MCP host config** - Configuration via MCP host

### Decision

We will use environment variables for all configuration.

### Rationale

- **Standard Practice**: Industry-standard for containerized apps
- **Security**: Secrets never in files
- **MCP Compatibility**: MCP hosts can set environment
- **Simplicity**: No config file parsing
- **12-Factor**: Follows 12-factor app principles

### Consequences

**Positive:**
- Simple configuration model
- Works with all deployment methods
- Secrets management friendly
- MCP host integration

**Negative:**
- No complex configuration structures
- No hot-reload of configuration
- All configuration equally visible to process
- Limited validation at startup

### Required Variables

| Variable | Required | Validation |
|----------|----------|------------|
| `SAILPOINT_BASE_URL` | Yes | Non-empty, valid URL |
| `SAILPOINT_CLIENT_ID` | Yes | Non-empty |
| `SAILPOINT_CLIENT_SECRET` | Yes | Non-empty |

### Startup Validation

```typescript
if (!SAILPOINT_BASE_URL) {
  console.error("Error: SAILPOINT_BASE_URL environment variable is required");
  process.exit(1);
}
```

---

## Decision Log Template

For future decisions, use this template:

```markdown
## ADR-XXX: [Title]

### Status

[Proposed | Accepted | Deprecated | Superseded by ADR-YYY]

### Context

[Describe the context and problem]

### Decision

[Describe the decision]

### Rationale

[Explain why this decision was made]

### Consequences

**Positive:**
- [Benefit 1]

**Negative:**
- [Drawback 1]

### Alternatives Considered

[List alternatives and why they were not chosen]
```

---

## Architecture Dimensions Analysis

### Modularity and Boundaries

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Code organization | Single file | Simplicity for MVP | Split if > 2000 lines |
| Tool grouping | Logical sections | Maintainability | Consider separate files |
| API coupling | Direct axios calls | Minimal abstraction | Add abstraction layer |

### Scalability and Performance

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Concurrency | Sequential | MCP protocol design | N/A |
| Caching | Token only | Stateless design | Add response cache |
| Rate limiting | None | SailPoint handles | Add client-side limits |

### Reliability and Availability

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Error handling | Basic formatting | MVP scope | Retry logic, circuit breaker |
| Failover | None | Single instance design | N/A for stdio |
| Health checks | None | stdio transport | Add for HTTP transport |

### Maintainability and Operability

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Logging | stderr only | Minimal for MVP | Structured logging |
| Monitoring | None | MCP host responsibility | Add metrics |
| Documentation | README + arch docs | MVP scope | Add API docs |

### Security and Privacy

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Authentication | OAuth 2.0 | Industry standard | N/A |
| Authorization | PAT scopes | SailPoint manages | Document required scopes |
| Data protection | Transient only | Security by design | N/A |

### Cost and Efficiency

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Resource usage | ~50-100MB | Node.js baseline | N/A |
| API calls | One per operation | Simplicity | Batch operations |
| Dependencies | Minimal (2 runtime) | Security, maintenance | Maintain minimal |

### Observability

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Logging | Basic stderr | MVP scope | Structured JSON logs |
| Tracing | None | Stateless design | OpenTelemetry |
| Metrics | None | MVP scope | Prometheus metrics |

### Compliance and Governance

| Aspect | Current State | Rationale | Future |
|--------|---------------|-----------|--------|
| Audit trail | SailPoint logs | Delegated to platform | Document requirements |
| Data handling | Transient only | Privacy by design | N/A |
| Dependency audit | Manual | MVP scope | Automated scanning |

---

## Open Questions and Gaps

1. **Testing Strategy**: No automated tests defined. Consider unit tests for tool handlers and integration tests against sandbox tenant.

2. **Versioning Strategy**: No API versioning strategy. Consider how to handle SailPoint API version changes.

3. **Deprecation Policy**: No policy for deprecating tools. Consider semantic versioning.

4. **Multi-Tenant Support**: Current design is single-tenant. Consider configuration for multi-tenant scenarios.

5. **Bulk Operations**: No batch/bulk API utilization. Consider adding bulk operation tools.
