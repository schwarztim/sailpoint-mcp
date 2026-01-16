# Data Flow Architecture

This document describes data flows through the SailPoint MCP Server, including sensitive data paths, trust boundaries, and data transformation points.

## High-Level Data Flow Diagram

```mermaid
flowchart TB
    subgraph "Trust Zone: User/Host"
        USER[User]
        HOST[MCP Host]
    end

    subgraph "Trust Zone: MCP Server"
        PROTO[Protocol Handler]
        TOOLS[Tool Handler]
        AUTH[Token Manager]
        CLIENT[API Client]
    end

    subgraph "Trust Zone: SailPoint Cloud"
        API[SailPoint API]
        STORE[(Identity Store)]
    end

    USER -->|1. Natural Language Query| HOST
    HOST -->|2. Tool Call JSON-RPC| PROTO
    PROTO -->|3. Parsed Request| TOOLS
    TOOLS -->|4. Token Request| AUTH
    AUTH -->|5. OAuth Token| CLIENT
    TOOLS -->|6. API Request| CLIENT
    CLIENT -->|7. HTTPS Request| API
    API -->|8. Query| STORE
    STORE -->|9. Data| API
    API -->|10. JSON Response| CLIENT
    CLIENT -->|11. Raw Data| TOOLS
    TOOLS -->|12. Formatted Response| PROTO
    PROTO -->|13. JSON-RPC Response| HOST
    HOST -->|14. Formatted Answer| USER
```

## Data Flow Sequences

### Read Operation: List Identities

```mermaid
sequenceDiagram
    participant User
    participant Host as MCP Host
    participant Server as MCP Server
    participant SailPoint as SailPoint API

    User->>Host: "List all identities in Engineering"
    Host->>Server: tools/call: list_identities<br/>{filters: "department eq Engineering"}

    Note over Server: Validate parameters

    Server->>SailPoint: GET /v3/public-identities<br/>?filters=department eq Engineering<br/>Authorization: Bearer <token>

    SailPoint-->>Server: 200 OK<br/>[{id, name, email, ...}, ...]

    Note over Server: Format as JSON string

    Server-->>Host: {content: [{type: "text", text: "[...]"}]}
    Host-->>User: "Here are the identities..."
```

**Data Classification at Each Step**:

| Step | Data | Classification | Handling |
|------|------|----------------|----------|
| 1 | User query | Internal | Plain text |
| 2 | Filter expression | Internal | URL-safe encoding |
| 3 | OAuth token | Credential | In-memory only |
| 4 | API response | PII | Logged minimally |
| 5 | Formatted output | PII | Returned to trusted host |

### Write Operation: Create Access Request

```mermaid
sequenceDiagram
    participant User
    participant Host as MCP Host
    participant Server as MCP Server
    participant SailPoint as SailPoint API

    User->>Host: "Request Admin role for John Doe"
    Host->>Server: tools/call: create_access_request<br/>{requestedFor: ["id-123"],<br/> requestedItems: [{type: "ROLE", id: "role-456"}]}

    Note over Server: Build request body

    Server->>SailPoint: POST /v3/access-requests<br/>Authorization: Bearer <token><br/>{requestedFor: [...], requestedItems: [...]}

    SailPoint-->>Server: 202 Accepted<br/>{id: "req-789", status: "PENDING"}

    Server-->>Host: {content: [{type: "text", text: "{...}"}]}
    Host-->>User: "Access request created successfully"
```

**Audit Trail**:

| Event | Actor | Action | Target |
|-------|-------|--------|--------|
| Request Created | MCP Server (PAT owner) | create_access_request | John Doe (id-123) |

### Authentication Flow: OAuth Token

```mermaid
sequenceDiagram
    participant Server as MCP Server
    participant TokenMgr as Token Manager
    participant SailPoint as SailPoint OAuth

    Note over Server: First API call or token expired

    Server->>TokenMgr: getAccessToken()

    alt Token cached and valid
        TokenMgr-->>Server: cached token
    else Token expired or missing
        TokenMgr->>SailPoint: POST /oauth/token<br/>grant_type=client_credentials<br/>client_id=xxx<br/>client_secret=yyy

        SailPoint-->>TokenMgr: {access_token, expires_in}

        Note over TokenMgr: Cache token with expiry

        TokenMgr-->>Server: new token
    end
```

**Credential Handling**:

| Credential | Storage | Transmission | Exposure |
|------------|---------|--------------|----------|
| Client ID | Environment variable | HTTPS POST body | Never logged |
| Client Secret | Environment variable | HTTPS POST body | Never logged |
| Access Token | In-memory variable | HTTPS header | Never logged |

## Trust Boundaries

```mermaid
graph TB
    subgraph "TRUST BOUNDARY 1: User Environment"
        USER[User]
        HOST[MCP Host]
        ENV[Environment Variables]
    end

    subgraph "TRUST BOUNDARY 2: MCP Process"
        direction TB
        RUNTIME[Node.js Runtime]
        MEMORY[Process Memory]
        SOCKET[Network Socket]
    end

    subgraph "TRUST BOUNDARY 3: Network"
        TLS[TLS 1.2+ Tunnel]
    end

    subgraph "TRUST BOUNDARY 4: SailPoint Cloud"
        LB[Load Balancer]
        API[API Gateway]
        AUTH_SVC[Auth Service]
        DATA[Data Services]
    end

    USER --> HOST
    HOST --> RUNTIME
    ENV -.-> RUNTIME
    MEMORY --> SOCKET
    SOCKET --> TLS
    TLS --> LB
    LB --> API
    API --> AUTH_SVC
    API --> DATA
```

### Boundary Analysis

| Boundary | Entry Point | Validation | Risk |
|----------|-------------|------------|------|
| **User -> Host** | Natural language | Host-dependent | Prompt injection |
| **Host -> MCP** | JSON-RPC stdio | Schema validation | Malformed requests |
| **MCP -> Network** | HTTPS | TLS certificate | MITM (mitigated) |
| **Network -> SailPoint** | API Gateway | OAuth + RBAC | Token theft |

## Sensitive Data Inventory

### Data Categories

| Category | Examples | Classification | Retention |
|----------|----------|----------------|-----------|
| **Identity Attributes** | name, email, department | PII | Transient (not stored) |
| **Account Details** | username, status, source | Confidential | Transient |
| **Entitlements** | permissions, group memberships | Confidential | Transient |
| **Credentials** | client_id, client_secret, tokens | Secret | Memory only |
| **Certification Decisions** | approve/revoke, reviewer, timestamp | Audit | Not stored locally |
| **SOD Violations** | conflicting access, risk score | Compliance | Not stored locally |

### Data Path Analysis

```mermaid
flowchart LR
    subgraph "Data at Rest"
        ENV[Environment<br/>Secrets]
        SP_DB[(SailPoint<br/>Database)]
    end

    subgraph "Data in Transit"
        STDIO[stdio<br/>JSON-RPC]
        HTTPS[HTTPS<br/>REST API]
    end

    subgraph "Data in Memory"
        TOKEN[Access<br/>Token]
        RESP[API<br/>Response]
    end

    ENV -->|Loaded| TOKEN
    SP_DB -->|Queried| HTTPS
    HTTPS -->|Received| RESP
    RESP -->|Serialized| STDIO
```

### Sensitive Data Protections

| Data | Protection | Implementation |
|------|------------|----------------|
| Client Secret | Never logged, memory-only | Not in formatError() |
| Access Token | Not persisted, auto-expires | 60s pre-expiry refresh |
| PII in responses | Passed through, not cached | No local storage |
| Audit events | Created in SailPoint | PAT owner recorded |

## Data Transformation Points

### Input Transformation (Host -> SailPoint)

```mermaid
flowchart LR
    A[JSON-RPC Request] --> B{Parse Arguments}
    B --> C[Build Query Params]
    B --> D[Build Request Body]
    C --> E[URL Encode]
    D --> F[JSON Stringify]
    E --> G[HTTP Request]
    F --> G
```

| Stage | Input | Output | Validation |
|-------|-------|--------|------------|
| Parse | JSON-RPC params | JS object | TypeScript types |
| Query Build | args object | Record<string, string> | Implicit |
| Body Build | args object | Structured body | None (trusted input) |
| Encoding | String values | URL-safe strings | axios default |

### Output Transformation (SailPoint -> Host)

```mermaid
flowchart LR
    A[HTTP Response] --> B[axios parse]
    B --> C[Extract data]
    C --> D[JSON.stringify]
    D --> E[Wrap in content]
    E --> F[JSON-RPC Response]
```

| Stage | Input | Output | Processing |
|-------|-------|--------|------------|
| HTTP Parse | Raw HTTPS response | axios response object | Auto by axios |
| Data Extract | response.data | Raw API payload | Direct access |
| Stringify | JS object | JSON string | Pretty print (2-space) |
| Wrap | JSON string | MCP content block | Standard format |

## Search Data Flow

### Full-Text Search

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant SailPoint

    Host->>Server: search({indices: ["identities"],<br/>query: "name:John AND dept:Eng"})

    Server->>SailPoint: POST /v3/search<br/>{indices: [...], query: {...}}

    SailPoint-->>Server: {results: [...],<br/>headers: {x-total-count: 42}}

    Note over Server: Combine results with count

    Server-->>Host: {results: [...], totalCount: "42"}
```

### Aggregate Query

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant SailPoint

    Host->>Server: search_aggregate({indices: ["identities"],<br/>aggregationType: "TERMS",<br/>aggregationField: "department"})

    Server->>SailPoint: POST /v3/search/aggregate<br/>{indices: [...], aggregationType: "TERMS",<br/>aggregationsRequest: {field: "department"}}

    SailPoint-->>Server: {buckets: [{key: "Eng", count: 100}, ...]}

    Server-->>Host: {buckets: [...]}
```

## Error Data Flows

### API Error Handling

```mermaid
flowchart TD
    A[API Call] --> B{Response Status}
    B -->|2xx| C[Return data]
    B -->|4xx/5xx| D[Extract error]
    D --> E{Error format?}
    E -->|messages array| F[Join message texts]
    E -->|message + detailCode| G[Format as code: message]
    E -->|Other| H[HTTP status: message]
    F --> I[Return error content]
    G --> I
    H --> I
```

### Error Response Examples

**SailPoint Validation Error**:
```json
{
  "detailCode": "INVALID_FILTER",
  "message": "Filter expression is invalid"
}
```

**MCP Error Response**:
```json
{
  "content": [{
    "type": "text",
    "text": "Error: INVALID_FILTER: Filter expression is invalid"
  }],
  "isError": true
}
```

## Pagination Data Flow

### Manual Pagination

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant SailPoint

    Host->>Server: list_identities({limit: 50, offset: 0})
    Server->>SailPoint: GET /v3/public-identities?limit=50&offset=0
    SailPoint-->>Server: [50 identities]
    Server-->>Host: [50 identities]

    Host->>Server: list_identities({limit: 50, offset: 50})
    Server->>SailPoint: GET /v3/public-identities?limit=50&offset=50
    SailPoint-->>Server: [50 identities]
    Server-->>Host: [50 identities]
```

### Search Cursor Pagination

```mermaid
sequenceDiagram
    participant Host
    participant Server
    participant SailPoint

    Host->>Server: search({..., limit: 100})
    Server->>SailPoint: POST /v3/search
    SailPoint-->>Server: {results: [100 items], searchAfter: ["cursor"]}
    Server-->>Host: {results: [...]}

    Host->>Server: search({..., searchAfter: ["cursor"]})
    Server->>SailPoint: POST /v3/search {searchAfter: [...]}
    SailPoint-->>Server: {results: [next 100 items]}
    Server-->>Host: {results: [...]}
```

## Open Questions and Gaps

1. **Response Size Limits**: No truncation of large API responses. Could cause memory issues.
2. **Rate Limit Headers**: SailPoint rate limit headers not exposed to caller.
3. **Partial Failure Handling**: No strategy for handling partial failures in multi-item operations.
4. **Data Masking**: No option to mask sensitive fields in responses.
5. **Audit Logging**: No local audit log of operations performed.

---

*Next: [Security](./security.md) - Threat model and security controls*
